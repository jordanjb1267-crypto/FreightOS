# Phase 1 Definition and Owner Decisions

**Status:** **Owner-approved.** Decisions A–E and Rulings F–H are ruled; the detention mechanism,
the quantitative gates, and the ten-PR sequence are approved. This remains the central Phase 1
planning artifact. It is **not** authorization to implement — Specification PR 1 is documentation
only, and PR 2 requires separate approval.
**Date:** 2026-08-04 · **Rulings recorded:** 2026-08-04
**Baseline:** `origin/main` @ `671b1d097ae166436a464f1a8daaffe8ea060e81`, tag
`freightos-phase-0-accepted`
**Binding handoff:** `docs/production-handoff/v1.2/` (immutable — ADR-0014 §3)
**Authority:** Subordinate to the Constitution, `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md`,
`config/scope/module_states.yaml`, the Phase 0 owner rulings in
`docs/decisions/0001-phase-0-decision-record.md`, and the Phase 1 owner rulings in
`docs/decisions/0002-phase-1-owner-rulings.md`.

This document is a specification and decision package. It contains no application code, no
migration, and no configuration change.

## Ruling status

Every decision analysed below has been ruled. The analysis is retained unchanged for traceability —
it is the reasoning the rulings were made on, not a live proposal.

| Decision                                       | Ruled                                                                 | Recorded in                                              |
| ---------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| A — Software-only operating-context boundaries | **Approved** as recommended                                           | `adr/0019-software-only-operating-context-boundaries.md` |
| B — RigReceipts integration depth              | **Approved** — `contract_and_simulation_only` for all of Phase 1      | `docs/decisions/0002-phase-1-owner-rulings.md` §2        |
| C — RIGDESK integration depth                  | **Approved** — `contract_and_simulation_only`, fail-closed asymmetry  | `docs/decisions/0002-phase-1-owner-rulings.md` §2        |
| D — PostgreSQL control-plane access            | **Approved** — hybrid, `BYPASSRLS` prohibited                         | `adr/0020-control-plane-access.md`                       |
| E — X12 licensing                              | **Approved** — abstract interfaces, canonical fixtures, non-X12 first | `adr/0023-x12-licensing-and-connector-boundary.md`       |
| F — Common record fields                       | **Approved**, with `updated_by` and `record_version` added            | `adr/0021-common-record-fields.md`                       |
| G — Geospatial representation                  | **Approved** — no PostGIS in Phase 1                                  | `adr/0022-geospatial-representation.md`                  |
| H — Package paths                              | **Approved**, with the authorized package roots named                 | `adr/0024-package-paths-and-dependency-direction.md`     |
| Detention and free time                        | **Approved** — policy-driven mechanism, no built-in default           | `adr/0025-detention-policy-driven-mechanism.md`          |
| Quantitative Phase 1 gates                     | **Approved**                                                          | `docs/governance/ACCEPTANCE_THRESHOLDS.md`               |
| Ten-PR sequence                                | **Approved**                                                          | `docs/decisions/0002-phase-1-owner-rulings.md` §5        |

Three points where the rulings went **beyond or differed from** the recommendations below, so the
ruled text governs where they diverge:

1. **Ruling F** adds `updated_by` and renames `version` to `record_version` — neither appears in
   §5's proposed text. It also enumerates four permitted nullable categories with per-table
   justification, which is stricter than the recommendation. ADR-0021 governs.
2. **Ruling H** names the authorized package roots explicitly — `packages/identity`,
   `packages/parties`, `packages/carrier`, `packages/modal-core`, `packages/mode-road`,
   `packages/facility-primitives`, `packages/rigreceipts-contracts`, `packages/rigdesk-contracts`.
   The plan's earlier `packages/domain-*` and singular `*-contract` names are superseded. ADR-0024
   and `docs/governance/DOMAIN_GLOSSARY.md` §5 govern.
3. **The detention ruling unblocks PR 7.** §4 and §16 below record free-time rules as blocking;
   ADR-0025 removes that by making the mechanism policy-driven with an explicit `POLICY_REQUIRED`
   refusal and no code-level default. OQ-4 is now non-blocking.

Three obligations the rulings create that no current artifact satisfies are tracked as OQ-19,
OQ-20, and OQ-21. The owner has accepted them as **implementation obligations, not defects in
Specification PR 1**, and each is assigned, gated, and fully specified — deficiency, target PR,
blocking dependency, required migration and schema work, required tests, exit evidence, and
owner-decision status — in `docs/governance/OPEN_QUESTIONS.md` §"Accepted implementation
obligations".

| ID    | Deficiency                                                                                                                        | Target PR                             | Blocks                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| OQ-19 | `app.kill_switch_scope` lacks `legal_entity` and `operating_context`, which Ruling A requires as kill-switch targets              | **PR 2**                              | Ruling A being enforceable at runtime from PR 2                                 |
| OQ-20 | The event envelope has no `purpose` attribute; `audit_events` has no `purpose` or `outcome` column, both mandatory under Ruling D | **PR 2**, ahead of the `admin` schema | Any `admin.*` function — ADR-0020 claims an audit trail that does not yet exist |
| OQ-21 | `schemas/custody-event.schema.json` still carries the pre-ADR-0015 `authority_mode` enum with no declared override                | **PR 6**                              | **PR 7**, where `custody_events` is created                                     |

None is implemented in PR 1, which is documentation only.

Where prose and configuration disagree, the stricter restriction wins
(`docs/production-handoff/v1.2/02_GOVERNANCE_AND_NON_REGRESSION.md:97`). That rule is applied
throughout, and every place it changed an answer is marked.

---

## 1. Baseline verification

### 1.1 Repository and reference state

| Item                         | Value                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| Repository                   | `jordanjb1267-crypto/FreightOS`                                             |
| Session branch               | `claude/freightos-phase-1-definition-284fu3`                                |
| Local `HEAD`                 | `671b1d097ae166436a464f1a8daaffe8ea060e81`                                  |
| `origin/main`                | `671b1d097ae166436a464f1a8daaffe8ea060e81`                                  |
| Local `main`                 | `e20e11892801292931a2a1be535005ef6ac49539` — stale clone artifact, see §1.4 |
| Acceptance tag object        | `732650184edf33906c13e659e5bd40b5c0bb5f62`                                  |
| Acceptance tag object type   | `tag` (annotated)                                                           |
| Commit targeted by the tag   | `671b1d097ae166436a464f1a8daaffe8ea060e81`                                  |
| Tag object on `origin`       | `732650184edf33906c13e659e5bd40b5c0bb5f62` — identical to local             |
| Working tree at verification | Clean (`git status --porcelain` empty)                                      |
| Phase 0 merge                | PR #2, merged 2026-08-04T19:58:22Z, head `878b325`, base `e20e118`          |

The tag is annotated, is byte-identical between local and `origin`, and dereferences to the
expected Phase 0 merge commit. `HEAD`, `origin/main`, and `freightos-phase-0-accepted^{commit}`
all resolve to `671b1d097ae166436a464f1a8daaffe8ea060e81`.

Tagger message: _"FreightOS Phase 0 accepted after verified CI, governance, security, migration,
RLS, scope, autonomy, and handoff-integrity checks."_

### 1.2 Validation suite executed at this SHA

Every check below was run in this session against the working tree at `671b1d0`.

| Check                        | Command                                                            | Result                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handoff checksums            | `sha256sum -c SHA256SUMS.txt` (in `docs/production-handoff/v1.2/`) | **90/90 OK**, 0 failures                                                                                                                                               |
| Handoff validator            | `python3 docs/production-handoff/v1.2/scripts/validate_handoff.py` | `HANDOFF_VALIDATION=PASS` · `FILES=91` · `SEQUENCING_DOCTRINE=PASS` · `HORIZON_1_STOP_RULE=PASS` · `DEFERRED_PRODUCTS_DISABLED=PASS` · `SAFETY_BOUNDARY=PASS` · exit 0 |
| Handoff provenance and drift | `node scripts/check-handoff-provenance.mjs`                        | `PROVENANCE=PASS` · `FILES=45` · `VERBATIM=42` · `AUTHORISED_OVERRIDES=3` · exit 0                                                                                     |
| Scope / anti-overbuilding    | `node scripts/validate-scope.mjs`                                  | `SCOPE_VALIDATION=PASS` · `HORIZON_1_ONLY=PASS` · exit 0                                                                                                               |
| Deferred-module controls     | same run                                                           | `DEFERRED_MODULES_DISABLED=PASS` — 18 modules checked, 8 mandatory-false flags, 7 prohibited paths                                                                     |
| Autonomy ceiling             | same run                                                           | `AUTONOMY_CEILING=PASS` — 32 agents checked, 25 clamped below declared ceiling                                                                                         |
| Safety boundary              | same run                                                           | `SAFETY_BOUNDARY=PASS` — 12 forbidden control verbs scanned                                                                                                            |
| Billing disabled             | same run                                                           | `BILLING_DISABLED=PASS` — 11 products checked, all `billing_enabled: false`                                                                                            |
| Unit tests                   | `pnpm test`                                                        | **56 passed (56)**, 4 files, exit 0                                                                                                                                    |
| Integration tests            | `pnpm test:integration` (PostgreSQL 16.13)                         | **49 passed (49)**, 3 files, exit 0                                                                                                                                    |
| Format                       | `pnpm format:check`                                                | All matched files use Prettier code style, exit 0                                                                                                                      |
| Lint                         | `pnpm lint`                                                        | Clean, exit 0                                                                                                                                                          |
| Typecheck                    | `pnpm typecheck`                                                   | 4 successful, 4 total, exit 0                                                                                                                                          |

The three declared provenance overrides are unchanged and still cite their authorizing ADRs:
`schemas/event-envelope.schema.json` (ADR-0015), `schemas/agent-manifest.schema.json`
(ADR-0015, ADR-0018), `config/agents/registry.yaml` (ADR-0018).

Integration tests were run against a local PostgreSQL 16.13 cluster started by
`scripts/dev-postgres.sh`, which is the sanctioned non-Docker path recorded in ADR-0016 §
"Local development without Docker". The cluster lives outside the repository under
`/var/tmp/freightos-pg` and adds no tracked file.

### 1.3 Accepted-baseline attributes reconfirmed

| Attribute                             | Evidence                                                                                                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 merged through PR #2          | PR #2 `merged: true`, merge commit `671b1d0`                                                                                                                                                                                                       |
| Phase 0 CI green                      | Merge commit body records run 30944630718, all 18 blocking steps success; all checks re-run green here                                                                                                                                             |
| Handoff byte-identical                | 90/90 checksums, provenance PASS, `FILES=91`                                                                                                                                                                                                       |
| 56 unit tests                         | `pnpm test` → 56 passed                                                                                                                                                                                                                            |
| 49 integration tests                  | `pnpm test:integration` → 49 passed                                                                                                                                                                                                                |
| Billing disabled                      | `BILLING_DISABLED=PASS`, 11 products, `config/pricing/products.yaml` all `billing_enabled: false`                                                                                                                                                  |
| Maximum effective autonomy A3         | `AUTONOMY_CEILING=PASS`; `adr/0018-autonomy-ceiling-enforcement.md:36-47` computes `min(declared, module, horizon)` with `horizonCeiling() = A3`                                                                                                   |
| No Phase 1 domain implementation      | `packages/database/migrations/` contains only `0001_platform_foundation`, `0002_tenants`, `0003_audit_and_outbox`, `0004_kill_switches`; `packages/database/test/integration/migrations.test.ts:177` asserts "creates no domain tables in Phase 0" |
| No deferred operational module active | `DEFERRED_MODULES_DISABLED=PASS`; `migrations.test.ts:159` asserts the AV tables are not created                                                                                                                                                   |
| Working tree clean                    | `git status --porcelain` empty before this document was written                                                                                                                                                                                    |
| Annotated tag pushed to origin        | `git ls-remote --tags origin` returns the same tag object SHA                                                                                                                                                                                      |

### 1.4 One discrepancy, reported and deliberately not repaired

**Local branch `main` is at `e20e11892801292931a2a1be535005ef6ac49539`, not at the accepted
baseline.** `e20e118` is the pre-Phase-0 commit (the PR #1 merge that installed the handoff) and
is the recorded base of PR #2.

This is a **clone artifact, not a baseline change**. The container checked out the session branch
directly and never fast-forwarded the local `main` ref. The authoritative refs are all correct:
`origin/main`, `HEAD`, and the acceptance tag agree on `671b1d0`, and the tag object matches
`origin` byte for byte. No content is missing or altered.

Repairing it would mean `git branch -f main origin/main` — a repository mutation. Session
restriction §2 forbids repairing a discrepancy without explicit owner authorization, so it is
reported and left alone. It has **no effect on any Phase 1 decision** in this document, because
every validator, test, and file read in §1.2 ran against the checked-out tree at `671b1d0`.

**Baseline verdict: intact.** No required check failed, the tag is present and correct, and the
tree was clean.

---

## 2. Binding Phase 1 scope

### 2.1 What authorizes Phase 1 at all

`21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md:56-71` enumerates the Horizon 1 authorized build.
`13_IMPLEMENTATION_ROADMAP.md:13-19` scopes Phase 1 within it.
`prompts/PHASE_1_UNIVERSAL_CORE.md:3-7` is the phase prompt.
`config/scope/module_states.yaml` is the machine-readable authority (`21_…:52`).

The merge commit for PR #2 states explicitly: _"Phase 1 is not authorized by this merge."_
Phase 1 begins only on an owner ruling. This document is the input to that ruling.

### 2.2 Module states governing Phase 1

| Module                           | State                              | Phase 1 consequence                                                                   |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `freightos_shared_core`          | `ACTIVE_BUILD`                     | Full implementation                                                                   |
| `road_ftl_carrier_operations`    | `ACTIVE_BUILD`                     | Full implementation                                                                   |
| `carrier_core`                   | `ACTIVE_BUILD`                     | Full implementation                                                                   |
| `carrier_copilot`                | `ACTIVE_BUILD`, `autonomy_max: A3` | Runtime is **Phase 2**; Phase 1 builds only the data it will read                     |
| `rigreceipts_economics_boundary` | `ACTIVE_BUILD`                     | Contract + simulation only (owner ruling 3)                                           |
| `rigdesk_maintenance_hooks`      | `ACTIVE_BUILD`                     | Contract + simulation only (owner ruling 3)                                           |
| `minimum_facility_primitives`    | `FOUNDATION_ONLY`                  | Shared primitives only. `module_states.yaml:18` — `standalone_product_allowed: false` |
| Everything else                  | gated or dormant                   | Contracts, schemas, disabled config, fixtures, simulation only                        |

`FOUNDATION_ONLY` permits `production_code_allowed: true` but
`live_external_writes_allowed: limited_to_active_product_workflow`
(`config/scope/module_states.yaml:16-19`). Facility primitives may be built as real tables and
APIs; they may not acquire an outward connector.

### 2.3 Authorized Phase 1 scope

Five domains plus the two external boundaries.

**Enterprise and identity hierarchy.** Tenant, Enterprise, Legal Entity, Operating Authority,
Business Unit, Region, Terminal, Fleet, User, Membership, Role, Permission, Service Account,
organization-node policy inheritance. Sources: `04_ENTERPRISE_SCALE_AND_TENANCY.md:5-33`,
`07_DATA_MODEL_AND_STATE_MACHINES.md:11`, `00_MASTER_HANDOFF.md:116-124`.

**Carrier operations foundation.** Carrier Profile, Driver, Powered Unit, Nonpowered Equipment,
Equipment Capability, Availability Window, Maintenance Restriction, Assignment, and the
active-powered-unit calculation. Sources: `07_…:19`, `05_MULTIMODAL_DOMAIN_AND_ADAPTERS.md:26-41`,
`03_PRICING_AND_BILLING.md:59-61`.

**Mode-neutral freight core.** Party, Location, Shipment, Consignment, Cargo Item, Handling Unit,
Transport Journey, Transport Leg, Custody Event, Milestone, Exception, Document reference.
Sources: `05_…:5-19`, `07_…:15`, `00_…:95-111`, Constitution Art. VII.

**Road FTL adapter.** Road extension fields, equipment compatibility, stop and route
representation, state-machine mapping, adapter contract, connector boundary, synthetic fixtures,
and the _interface targets_ X12 204/990/214/210. Sources: `05_…:44-51`,
`11_INTEGRATIONS_API_EDI_AND_MCP.md:49-56`, `schemas/modal-adapter.schema.json`.

**Load opportunity and carrier economics foundation.** Load Opportunity, ingestion boundary,
normalized commercial facts, Cost Profile, profitability calculation contract, calculation
provenance, formula version, rounding policy, input freshness, audit evidence. Sources:
`07_…:37-41`, `07_…:63-65`, `21_…:64`.

**Minimum facility primitives** (`FOUNDATION_ONLY`). Exactly the list at `21_…:77-87`, no more.

**External product boundaries.** RigReceipts carrier-economics contract and simulation; RIGDESK
maintenance-hooks contract and simulation. No live external writes, no production credentials.

### 2.4 Explicitly out of Phase 1

Two categories, and they fail differently.

**Deferred to Phase 2/3 but inside Horizon 1** — build the data, not the behavior:

- AI ranking, recommendation, scoring, and multi-load planning (`13_…:23`)
- Negotiation, counteroffers, tender sending (`13_…:23,29`)
- Dispatch Copilot runtime, agent runtime, tool invocation (`13_…:23`)
- Any A3 approval-to-execute path (`13_…:29`)
- Any consequential external action — `prompts/PHASE_1_UNIVERSAL_CORE.md:7` is unconditional
- Policy engine and canonical action registry (Phase 0 carry-forward item 2)
- Kill-switch enforcement at the command-execution point (Phase 0 carry-forward item 1)
- Billing activation (`checklists/HORIZON_1_PRODUCTION_RELEASE_GATE.md`)

**Prohibited outright** (`21_…:109-121`, `01_CONSTITUTION.md:69-78`):

Standalone FacilityOS or WMS/YMS/WES replacement · A4/A5 autonomous dispatch · direct shipper
procurement · brokerage execution · freight exchange · live autonomous-vehicle missions · remote
driving or any dynamic-driving-task control · robotics, PLC, conveyor, dock-restraint, door, or
safety-interlock commands · rail, ocean, or air operational workflows · production brokerage,
rail, ocean, facility-automation, or ADS credentials.

### 2.5 Autonomy ceiling for Phase 1

`13_IMPLEMENTATION_ROADMAP.md:19` and `prompts/PHASE_1_UNIVERSAL_CORE.md:7` both set **A0–A2**
for Phase 1 — one level _below_ the A3 horizon ceiling that `adr/0018:45` enforces. Under
`02_…:97` the stricter reading governs: **Phase 1 effective ceiling is A2**, and no Phase 1
artifact may create an execution path above A2. The A3 backstop in `effectiveMaximumAutonomy()`
stays as it is; Phase 1 simply must not build anything that reaches it.

---

## 3. Existing owner rulings preserved

These are already binding. Phase 1 inherits them unchanged; none is reopened here.

| #   | Ruling                                                                                                                                                                                                                                                                                                                                                                                            | Recorded in                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Repository stays `FreightOS`; handoff stays at `docs/production-handoff/v1.2/`; the preserved package is immutable                                                                                                                                                                                                                                                                                | `adr/0014-repository-and-handoff-location.md:21-29`             |
| 2   | Generated root operational copies, no symlinks, provenance + CI drift detection                                                                                                                                                                                                                                                                                                                   | `adr/0014:30-37`, `handoff-provenance.json`                     |
| 3   | Handoff SQL is reference DDL and is never executed; reviewed migrations live in `packages/database/migrations/` with tested down paths                                                                                                                                                                                                                                                            | `adr/0017-reference-ddl-and-implementation-migrations.md:29-42` |
| 4   | `legal_authority_class` × `operating_context` replace the overloaded `authority_mode`; the pairing table is enforced, not conventional; brokerage is fail-closed                                                                                                                                                                                                                                  | `adr/0015-legal-authority-class-and-operating-context.md:30-64` |
| 5   | Infrastructure baseline fixed: pnpm, Turborepo, strict TypeScript, Fastify modular monolith, REST + generated OpenAPI, PostgreSQL 16, thin typed SQL, reviewed raw SQL migrations, Temporal, CloudEvents envelopes, transactional outbox, S3-compatible abstraction, GitHub Actions, Vitest, PostgreSQL integration tests, OpenTelemetry, provider-independent model gateway, MCP as adapter only | `adr/0016-infrastructure-baseline.md:23-39`                     |
| 6   | Autonomy ceilings are computed, never configured; no configuration path raises one                                                                                                                                                                                                                                                                                                                | `adr/0018:31-53`                                                |
| 7   | RigReceipts / RIGDESK are contract and simulation boundaries only — no live credentials, no live external writes, no invented economics or maintenance decisions                                                                                                                                                                                                                                  | `docs/decisions/0001-phase-0-decision-record.md:50-52`          |
| 8   | The common-field contract on every table this project creates                                                                                                                                                                                                                                                                                                                                     | `adr/0017:44-60`                                                |
| 9   | `db/0005` is never applied; its facility half is authored fresh as a Phase 1 migration, its AV half stays reference-only                                                                                                                                                                                                                                                                          | `adr/0017:41-42`                                                |

Replacing any item in ruling 5 requires an owner-approved superseding ADR (`adr/0016:21`).

---

## 4. Decision analysis A–E

### Decision A — Software-only operating-context boundaries

**Exact question.** For each of `shipper_owned`, `facility_operator`, and `autonomous_mobility`
under `legal_authority_class = software_only`: what may the context read, what may it write, which
legal entity is accountable, is a carrier appointment required, which actions are categorically
prohibited, what are the RLS implications, what must the event envelope carry, what is the
kill-switch scope, and what must be audited?

**Why it matters.** ADR-0015 created these three contexts and gave them a legal class, but
`09_AUTONOMY_POLICY_AND_AUTHORITY.md:41-47` defines boundary rules for only two of the original
five values. ADR-0015 §Context says so directly: _"`shipper_owned`, `facility_operator`, and
`autonomous_mobility` have no legal semantics at all."_ Phase 1 is the first phase that writes
data under these contexts — every facility primitive is a `facility_operator` write, and every
shipper-side collaboration link is a `shipper_owned` write. Without boundaries, the enum values
exist but nothing constrains what they authorize, and `software_only` silently becomes a
permission wildcard.

**Options.**

| Option | Description                                                                                      | Assessment                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1     | Leave undefined; treat `software_only` as "no special restriction"                               | **Reject.** Violates Constitution Art. I.2 (missing or inconsistent legal context fails closed) and Art. I.5 (no agent grants itself authority). Makes `software_only` a wildcard. |
| A2     | Per-context capability matrix, fail-closed, enforced in policy + RLS + envelope + database CHECK | **Recommended.**                                                                                                                                                                   |
| A3     | Collapse the three into one `software_only` context                                              | **Reject.** Reintroduces the overloading ADR-0015 removed, and makes facility, shipper, and AV audit trails indistinguishable.                                                     |
| A4     | Give each context its own `legal_authority_class`                                                | **Reject.** "Operating a facility is not a legal authority" — ADR-0015 §Context. Would imply regulatory posture that does not exist.                                               |

**Recommended option: A2** — an explicit, fail-closed capability matrix, defined below in §9.3.

Summary of the recommended boundaries:

| Dimension                        | `shipper_owned`                                                                                                                                                                                                | `facility_operator`                                                                                                                                                                                                                   | `autonomous_mobility`                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **May read**                     | Shipments, consignments, cargo, journeys, legs, milestones, documents, exceptions, appointments, cargo readiness, goods receipts, discrepancies — **for shipments where the tenant's legal entity is a party** | Facility identity/hours/restrictions, appointments, vehicle visits, gate/staging/dock references, load-unload events, seals, custody events, detention clocks, goods receipts, discrepancies — **for facilities the tenant operates** | **Nothing in Phase 1.** No AV data exists; the AV module is `INTERFACE_AND_SIMULATION_ONLY`                    |
| **May write**                    | Cargo readiness, appointment _requests_, shipper-side documents, shipper-side exceptions, delivery discrepancy claims                                                                                          | Appointment proposals/confirmations, vehicle-visit lifecycle, gate/staging/dock references, load-unload start/complete, seal records, custody events, detention clock start/stop, goods receipts, discrepancies                       | **Nothing in Phase 1.** Simulation fixtures only, never persisted to domain tables                             |
| **Accountable legal entity**     | The shipper/consignor legal entity named on the record. `legal_entity_id` mandatory                                                                                                                            | The facility-operating legal entity. `legal_entity_id` mandatory                                                                                                                                                                      | Would be the fleet-operating legal entity. Not exercised in Phase 1                                            |
| **Carrier appointment required** | **No** — and asserting one is an error. `packages/context/src/legal.ts:124-126` already rejects `carrierId` outside `carrier_agent`                                                                            | **No**, same rejection applies                                                                                                                                                                                                        | **No** in Phase 1                                                                                              |
| **Categorically prohibited**     | Accepting freight on a carrier's behalf; selecting among carriers; any rate/tender/negotiation write; reading another tenant's economics; reading carrier cost profiles                                        | Any of the twelve forbidden control verbs; issuing dispatch; accepting a load; writing carrier availability, assignments, or cost profiles; releasing a risk, quality, provider, or maintenance hold                                  | Everything. Any AV domain write in Phase 1 is a scope violation                                                |
| **RLS implication**              | Standard tenant predicate **plus** a party-membership predicate: the tenant's legal entity must appear as a party on the shipment                                                                              | Standard tenant predicate **plus** a facility-operatorship predicate                                                                                                                                                                  | No tables; nothing to predicate                                                                                |
| **Event envelope**               | `legalauthorityclass: software_only`, `operatingcontext: shipper_owned`, `legalentityid` **required** (`schemas/event-envelope.schema.json` `allOf[0].else`)                                                   | Same shape with `facility_operator`                                                                                                                                                                                                   | Same shape with `autonomous_mobility`; not emitted in Phase 1                                                  |
| **Kill-switch scope**            | `legal_plane` scope keyed on `software_only:shipper_owned`, plus `tenant`                                                                                                                                      | `legal_plane` keyed on `software_only:facility_operator`, plus `tenant`; **plus** a per-facility `integration` scope once a facility connector exists (Phase ≥ 2)                                                                     | `legal_plane` keyed on `software_only:autonomous_mobility`, held permanently engaged at `suspended` in Phase 1 |
| **Audit**                        | Every write emits `audit_events` with the pair, actor, legal entity, and correlation id                                                                                                                        | Same, **plus** custody and detention writes additionally require evidence references (`14_…:66`, `19_…:154-164`)                                                                                                                      | Any attempt is audited as a denied action                                                                      |

`autonomous_mobility` deserves the explicit statement: **it is defined but unused in Phase 1.**
Defining it now prevents an unbounded value from being reachable, and the recommended posture is a
standing `legal_plane` kill switch at `suspended` so an accidental code path fails closed rather
than merely failing a review.

**Benefits.** Article I.2 becomes decidable for all six contexts, not just two. Facility writes
stop looking like carrier writes in the audit ledger. `software_only` acquires a ceiling instead
of being the residual class.

**Risks.** The party-membership and facility-operatorship predicates add a join to hot read paths;
if written badly they become a performance problem at the 100,000-unit scale target
(`04_…:45-56`). Mitigated by materializing membership as an indexed association table rather than
recomputing it per query. A second risk is over-restriction blocking a legitimate Phase 2 shipper
workflow — mitigated by making the matrix additive: broadening a context later is an ADR, not a
schema change.

**Reversibility.** **High.** The matrix is policy plus RLS predicates. Broadening is a reviewed
migration and an ADR. Narrowing later is much harder, which is the argument for starting narrow.

**Phase 1 consequences.** Determines the RLS predicate on every facility table, the accepted
envelope shapes, and whether the facility primitives can be written at all. Without this ruling
PR 7 (facility primitives) cannot start.

**Exact artifacts affected.** New ADR-0019 · `packages/context/src/legal.ts` (context capability
matrix) · every Phase 1 migration's RLS policy · `schemas/custody-event.schema.json` (see
contradiction C1, §13) · `config/policy/base_policy.yaml` successor · `docs/governance/POLICY_REGISTRY.md`
· `docs/governance/DATA_CLASSIFICATION.md`.

**Can Phase 1 partially proceed first?** **Yes.** PRs 2–6 (identity, parties/locations, carrier
registries, freight core, state machines) are entirely `carrier_agent` + `system` and do not touch
these contexts. PR 7 onward is blocked.

**Latest responsible decision point.** Before PR 7 (minimum facility primitives) opens. Practically
this means before PR 2 merges, because the identity model in PR 2 defines the legal-entity
association these predicates read.

---

### Decision B — RigReceipts integration depth

**Exact question.** Does Phase 1 implement (1) contract and simulation only, (2) read-only live
integration, or (3) limited bidirectional integration with RigReceipts?

**Why it matters.** `21_…:63` makes the RigReceipts carrier-economics boundary a Horizon 1 item,
and the profitability calculation contract in Phase 1 scope depends on it. But **no RigReceipts
contract artifact exists anywhere in this repository.** A full-text search over `*.md`, `*.yaml`,
`*.json`, and `*.ts` returns only prose references — `00_MASTER_HANDOFF.md:41-43` (what RigReceipts
owns), `17_…:51` (FreightOS "consumes defined contracts"), and the governance rows recording their
absence. `docs/governance/RISK_REGISTER.md:16` (R-07) states it plainly: _"RigReceipts / RIGDESK
contracts do not exist, yet both are `ACTIVE_BUILD`."_
`docs/governance/INTEGRATION_REGISTRY.md:22` records _"Contract does not yet exist."_

There is no methodology, no field list, no formula, no error taxonomy, and no endpoint. Options 2
and 3 cannot be _specified_, let alone built.

**Options.**

| Option                                             | Feasible today? | Assessment                                                                                                                                                                                              |
| -------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 — Contract + simulation only for all of Phase 1 | Yes             | **Recommended.**                                                                                                                                                                                        |
| B2 — Read-only live integration during Phase 1     | **No**          | Requires an authoritative contract, a registered integration with all sixteen fields (`11_…:15`), security review (`02_…:41-49`), and a credential owner. None exists. Also contradicts owner ruling 3. |
| B3 — Limited bidirectional integration             | **No**          | Everything wrong with B2, plus an external write, which `21_…:105` forbids for scaffold code and which owner ruling 3 forbids outright.                                                                 |

**Recommended option: B1 — contract and simulation only.**

This is not a preference; it is the only option the repository evidence supports. The task's own
default stands: _"unless repository evidence establishes that a live integration can be safely
specified"_ — the evidence establishes the opposite.

**What B1 delivers.** A versioned request/response contract (§10.1) with every business formula
marked `EXTERNALLY_SUPPLIED / UNRESOLVED`, a deterministic simulator returning fixture-backed
responses, contract tests, and a `RIGRECEIPTS_LIVE_ENABLED=false` mandatory-false flag. FreightOS
computes nothing it has not been given a formula for.

**Explicit non-invention rule.** Phase 1 must not author break-even, target-rate, loaded-mile, or
all-mile formulas. The contract carries `formula_version` and `formula_source` fields; the
simulator returns values from fixtures with `provenance.source = "simulation"`. Any figure whose
`formula_source` is not an authoritative RigReceipts artifact is unusable for a commercial
decision and must be surfaced as such.

**Benefits.** Unblocks the entire cost-profile and profitability surface without inventing
economics. Keeps `TENANT_ECONOMICS` data — which `docs/governance/DATA_CLASSIFICATION.md` prohibits
from both development copies and model providers — out of scope for an integration nobody has
reviewed. Preserves the exact seam a real integration will occupy.

**Risks.** The simulated contract may not match the eventual real one, forcing rework — mitigated
by versioning the contract from v1 and treating the simulator as a conformance target, not a spec.
Second risk: a downstream consumer mistakes simulated economics for real ones — mitigated by making
`provenance` a required, non-nullable field that names the source on every response.

**Reversibility.** **High.** Moving to a live read is an additive change behind a flag plus a
completed integration-registry row and security review.

**Phase 1 consequences.** Profitability outputs in Phase 1 are structurally provenance-tagged and
commercially non-authoritative. Any Phase 2 ranking that consumes them must check `provenance`.

**Exact artifacts affected.** New `packages/rigreceipts-contract/` (schemas + types + simulator) ·
`docs/governance/INTEGRATION_REGISTRY.md:22` · `config/scope/module_states.yaml` (new
mandatory-false flag) · `scripts/validate-scope.mjs` (assert the flag) · `docs/governance/RISK_REGISTER.md` R-07.

**Can Phase 1 partially proceed first?** **Yes** — everything except PR 9. And PR 9 can proceed
under B1 without further input, which is precisely why B1 is recommended.

**Latest responsible decision point.** Before PR 9 opens. Low urgency: the recommended option is
the status-quo owner ruling 3, so silence defaults correctly.

---

### Decision C — RIGDESK integration depth

**Exact question.** Does Phase 1 implement (1) contract and simulation only, (2) read-only
maintenance-status integration, or (3) maintenance-request write integration?

**Why it matters.** Maintenance restrictions gate the active-powered-unit calculation and
equipment availability. `19_…:187` is unambiguous: _"RIGDESK owns maintenance work orders and
return-to-service evidence. FreightOS updates capacity only after the authoritative maintenance or
provider state permits it."_ If FreightOS guesses maintenance state, it either dispatches an
out-of-service unit or strands a serviceable one.

As with B, **no authoritative RIGDESK contract exists in this repository.**
`docs/governance/INTEGRATION_REGISTRY.md:23` records _"Contract + simulation only. Contract does
not yet exist."_ The only in-repo RIGDESK reference beyond prose is
`config/agents/registry.yaml:467`, which describes an agent purpose, not an interface.

**Options.**

| Option                            | Feasible today? | Assessment                                                                                                                                |
| --------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C1 — Contract + simulation only   | Yes             | **Recommended.**                                                                                                                          |
| C2 — Read-only maintenance status | **No**          | No contract, no registered integration, no credential owner, no security review.                                                          |
| C3 — Maintenance-request writes   | **No**          | Everything in C2, plus it would place FreightOS in the position of requesting maintenance — which §C's own constraint forbids in Phase 1. |

**Recommended option: C1 — contract and simulation only.**

**The authority boundary, stated for the record.** In Phase 1 FreightOS may:

- **consume** a maintenance restriction and mark equipment unavailable;
- **surface** a recommendation to a human ("this unit's restriction expires in 3 days");
- **record** the provenance and freshness of the restriction it consumed.

FreightOS may **not**: diagnose a fault, decide that maintenance is due, approve maintenance,
schedule maintenance, release a maintenance hold, or infer return-to-service. `02_…:86` forbids an
agent releasing a provider, facility, cybersecurity, quality, or maintenance hold. Under the A2
Phase 1 ceiling, even the recommendation is prepare-only — it cannot be sent anywhere.

**Benefits.** Equipment availability becomes modelable without FreightOS acquiring clinical
authority it must never have. The `MaintenanceRestriction` entity (`07_…:19`) gets a defined
source-of-truth story instead of a nullable status column.

**Risks.** Simulated restrictions could be mistaken for authoritative — mitigated by requiring
`authoritative_source` and `observed_at` as non-null on every restriction row, and by a test
asserting that a restriction with `source = 'simulation'` cannot make a unit _available_ (it may
only make it unavailable — a fail-closed asymmetry).

**Reversibility.** **High**, same shape as Decision B.

**Phase 1 consequences.** The active-powered-unit calculation must treat unknown maintenance state
as **not active** rather than active. This is a fail-closed choice with a real commercial
consequence later (it undercounts the metering basis), and it is the correct one: the metering
basis is not billable in Phase 1 anyway (`checklists/HORIZON_1_PRODUCTION_RELEASE_GATE.md`), so
erring toward exclusion costs nothing and erring toward inclusion would inflate a future invoice.

**Exact artifacts affected.** New `packages/rigdesk-contract/` · `docs/governance/INTEGRATION_REGISTRY.md:23`
· Specification 2 (`MaintenanceRestriction`) · Specification 9 · `config/scope/module_states.yaml`
(`RIGDESK_LIVE_ENABLED=false`) · R-07.

**Can Phase 1 partially proceed first?** **Yes**, except PR 9. Note the coupling: PR 4 (carrier and
fleet registries) defines `MaintenanceRestriction`, and its `authoritative_source` field shape
depends on this ruling. Under C1 that field is `text NOT NULL` with a simulation value permitted —
under C2 it would need a provider identity model. **PR 4 therefore assumes C1.**

**Latest responsible decision point.** Before PR 4 opens — earlier than Decision B, because the
carrier registry embeds the assumption.

---

### Decision D — PostgreSQL control-plane access

**Exact question.** How does the global control plane (`04_…:37-39`) read and write across tenants
without giving any application role a cross-tenant escape?

**Why it matters.** `04_…:37-39` requires a control plane holding tenant routing, identity
metadata, product catalog, deployment registry, agent/model registry, global policy definitions,
and the billing catalog. Some of that is inherently cross-tenant. Meanwhile `02_…:57` forbids
cross-tenant admin shortcuts and Constitution Art. III.1 makes tenant isolation a constitutional
guarantee. Phase 1 multiplies the exposure: Phase 0 has 4 tables, Phase 1 will have roughly 45.

**What Phase 0 already decided, and what it did not.** `packages/database/migrations/0001_platform_foundation.up.sql:63-68`
records the choice explicitly:

> `freightos_control_plane` the global control plane (04_ENTERPRISE_SCALE_AND_TENANCY:37-39).
> Cross-tenant by design, via an explicit policy branch rather than BYPASSRLS, so the escape is
> visible in the policy and works without cluster superuser.

`app.is_control_plane()` (`0001:121-128`) is a **role-membership** check, not a session variable,
so a tenant session cannot set its way across the boundary —
`packages/database/test/integration/rls.test.ts:147` proves it. Option 2 is therefore not a
proposal; it is the accepted baseline.

What Phase 0 did **not** provide: any record that a control-plane read happened. The policy branch
makes the escape _visible in the source_. It does not make a _use_ of the escape auditable. For 4
platform tables that was tolerable. For 45 domain tables holding `TENANT_ECONOMICS` and `PERSONAL`
data it is not — Constitution Art. III.2 singles out customer economics by name, and
`10_SECURITY_COMPLIANCE_AND_LEGAL_GATES.md:5` requires auditing privileged actions.

**Options.**

| Option                                                                | Fails closed | Preserves isolation | Blocks session self-elevation | CI-testable | Auditable | App role not superuser-equivalent |
| --------------------------------------------------------------------- | ------------ | ------------------- | ----------------------------- | ----------- | --------- | --------------------------------- |
| D1 — `BYPASSRLS`                                                      | No           | Weakest             | Yes                           | Partly      | No        | **No** — near-superuser           |
| D2 — Explicit policy branch (Phase 0 baseline)                        | Yes          | Yes                 | Yes                           | Yes         | **No**    | Yes                               |
| D3 — Dedicated admin connection + narrow `SECURITY DEFINER` functions | Yes          | Yes                 | Yes                           | Yes         | Yes       | Yes                               |
| D4 — **Hybrid: D2 as the mechanism, D3 as the only entry point**      | Yes          | Yes                 | Yes                           | Yes         | Yes       | Yes                               |

**Recommended option: D4 — hybrid, built on what Phase 0 already shipped.**

Concretely:

1. **Keep** `app.is_control_plane()` and the policy branch as the isolation mechanism. It is
   proven, tested, and requires no cluster superuser. **Do not** introduce `BYPASSRLS` anywhere.
2. **Narrow the surface.** `freightos_control_plane` gets table privileges only on the tables the
   control plane genuinely needs cross-tenant. Phase 1 must enumerate these — the default for a
   new domain table is **no control-plane grant at all**, and the policy branch is written only
   where a grant exists.
3. **Route every use through a named function.** Cross-tenant operations are exposed as
   `SECURITY DEFINER` functions in an `admin` schema with explicit arguments — e.g.
   `admin.reassign_tenant_routing(...)`, `admin.export_tenant_audit(...)`. `EXECUTE` is granted to
   `freightos_control_plane` and to nobody else. Each function writes an `audit_events` row before
   returning, with `operating_context = 'system'` and the invoking actor.
4. **Separate the connection.** The control plane connects as a distinct database user, from a
   distinct credential, never from the application connection pool.
5. **Assert the shape in CI.** Tests that must exist: no role holds `rolbypassrls`; every
   tenant-owned table has a policy (the Phase 0 test at `rls.test.ts:192` already does this and
   must be extended to Phase 1 tables); `freightos_app` is not a member of
   `freightos_control_plane`; a tenant session cannot `SET ROLE` into it; every `admin.*` function
   emits an audit row; every `SECURITY DEFINER` function pins `search_path`.

**Why not D3 alone.** Without the policy branch, `SECURITY DEFINER` functions owned by a role that
is itself RLS-exempt would reintroduce an invisible escape. D2 keeps the escape declarative and
readable in `pg_policies`.

**Why not D1, ever.** `BYPASSRLS` is a role attribute with no per-table granularity, no policy
text to review, and no audit trail. `rls.test.ts:168` already asserts `FORCE ROW LEVEL SECURITY`
so that even the table owner is subject; adding `BYPASSRLS` would undo the intent of that test
while leaving it passing.

**Benefits.** Every cross-tenant access becomes a named, argument-bounded, audited operation.
`pg_policies` remains the readable statement of who can see what. No new superuser dependency.

**Risks.** Function proliferation — one function per operation could sprawl. Mitigated by
requiring an ADR entry per `admin.*` function and reviewing the list at each phase exit gate.
Second risk: a `SECURITY DEFINER` function with a mutable `search_path` is a privilege-escalation
vector. Mitigated by a CI assertion that every such function sets `search_path` explicitly.

**Reversibility.** **Medium.** Adding functions is easy; removing a control-plane grant after
operations depend on it is disruptive. This argues for granting nothing by default.

**Phase 1 consequences.** Every Phase 1 migration must state, per table, whether the control plane
gets a grant and why. The answer for almost all domain tables is **no**.

**Exact artifacts affected.** New ADR-0020 · every Phase 1 migration's `GRANT`/`CREATE POLICY`
block · new `admin` schema migration · `packages/database/test/integration/rls.test.ts` ·
`docs/governance/THREAT_MODEL.md` · a new control-plane-access runbook under `docs/runbooks/`.

**Can Phase 1 partially proceed first?** **No, not safely.** The RLS and grant pattern is set by
the first domain migration (PR 2) and copied by every later one. Deciding after PR 2 means
rewriting every policy block.

**Latest responsible decision point.** **Before PR 2 opens.** This is the earliest and hardest
deadline of the five decisions.

---

### Decision E — X12 licensing and implementation

**Exact question.** What can be built without licensed X12 specifications, what requires licensed
implementation guides, should Phase 1 contain only abstract interfaces and synthetic fixtures,
what must be deferred, what are the cost/legal/schedule risks, and should non-X12 ingestion be the
first working road-adapter path?

**Why it matters.** `05_…:51` and `11_…:53` both name X12 204, 990, 214, and 210 as initial road
targets, and this document's authorized scope includes them as _interface targets_. X12 transaction
sets are published by ASC X12 under licence; implementation guides are separately licensed
documents. `docs/governance/RISK_REGISTER.md:24` (R-15) already records this as open:
_"X12 transaction sets are licensed documents and are Horizon 1 scope (204/990/214/210). Never
called out as a cost or prerequisite anywhere in the package."_
`docs/governance/INTEGRATION_REGISTRY.md:26` marks EDI _"Not registered… licensing is an unresolved
prerequisite (R-15)."_

**What can be built with no licence at all.**

- The internal canonical road-leg model. `11_…:51` is explicit: _"Translate at the boundary. Never
  make X12 segments the internal model."_ The canonical model owes nothing to X12.
- An abstract `EdiInboundMessage` / `EdiOutboundMessage` boundary type carrying
  `standard`, `transaction_set` (as an opaque string), `version`, `trading_partner_id`,
  `raw_payload_reference`, `parse_status`, and `normalized_payload`.
- A translator **interface** — `translate(inbound) → CanonicalLoadTender | CanonicalStatusUpdate`
  — with no implementation for X12.
- Synthetic fixtures in FreightOS's **own canonical JSON**, not in X12 syntax.
- Per-trading-partner map **versioning** metadata (`11_…:56`), with zero maps populated.
- The full non-X12 ingestion path: canonical JSON API, webhook, CSV, and document/email
  references.

**What requires a licence before it can be written.**

- Any segment/element/qualifier layout for 204, 990, 214, or 210.
- Any fixture containing real X12 syntax (`ISA`/`GS`/`ST` envelopes, `B2`/`L11`/`AT7` segments).
- Any code-list value drawn from an X12 data element (status/reason codes in 214, for example).
- Any partner implementation guide.
- Conformance tests asserting correct X12 output.

**Recommendation.**

1. **Phase 1 contains abstract interfaces and canonical-format synthetic fixtures only.** No X12
   syntax enters the repository. The road adapter declares `standards: ["X12-204", "X12-990",
"X12-214", "X12-210"]` in its manifest as _named targets_, with `implemented: false` and
   `blocked_on: "licensing"`.
2. **Non-X12 ingestion is the first working road-adapter path.** Canonical JSON over the REST API
   is the reference implementation, and it is the path Phase 2 will actually exercise. This is
   consistent with `00_…:136` ("Manual, email, document, and approved integration ingestion") and
   `21_…:87` (facility ingestion via "API, email, document, EDI, and webhook").
3. **Defer until licensing is obtained:** every X12 map, every X12 fixture, every X12 code list,
   and the EDI integration-registry row.
4. **Do not reproduce or paraphrase licensed content.** Not in code, not in comments, not in
   fixtures, not in this document. Nothing here does.

**Risks.**

| Risk         | Assessment                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Legal**    | Reproducing licensed X12 content without a licence is a copyright exposure. Severity: high. Fully avoided by recommendation 4.                                                                             |
| **Cost**     | ASC X12 membership/licensing plus per-guide fees, unbudgeted anywhere in the package. Owner must price it. Unknown but non-trivial.                                                                        |
| **Schedule** | Procurement is an owner-side lead time with no engineering lever. Because it is not on the Phase 1 critical path under this recommendation, the schedule risk is contained to the eventual EDI enablement. |
| **Design**   | Building the canonical model first and mapping later is the correct order anyway (`11_…:51`). The recommendation costs nothing in design quality.                                                          |

**Benefits.** The road adapter ships complete and testable in Phase 1 with zero licensing
exposure, and the seam where X12 maps will attach is defined and versioned.

**Reversibility.** **High.** Adding a map behind the existing translator interface is additive.

**Phase 1 consequences.** The road adapter's EDI capability is declared and unimplemented. Phase 2
load ingestion uses canonical JSON. No integration-registry EDI row is completed.

**Exact artifacts affected.** New `packages/mode-road/` adapter manifest ·
`schemas/modal-adapter.schema.json` `standards` field · `docs/governance/INTEGRATION_REGISTRY.md:26`
· R-15 · Specification 7.

**Can Phase 1 partially proceed first?** **Yes, entirely.** Under this recommendation the licensing
question never blocks Phase 1 — that is the recommendation's main practical benefit. It blocks only
the eventual EDI enablement.

**Latest responsible decision point.** Before PR 8 opens, and only to confirm the "interfaces and
canonical fixtures only" posture. The _licensing procurement_ decision can be taken any time before
EDI enablement is scheduled, which is Phase 2 at the earliest.

---

## 5. Recommended owner rulings — **all adopted**

Stated as the exact text the owner would adopt. **Every ruling below was adopted on 2026-08-04**;
Rulings F and H were adopted with additions, noted in the Ruling status table above. The
authoritative text is now `docs/decisions/0002-phase-1-owner-rulings.md` and the ADRs it names;
what follows is the proposal that was ruled on.

> **Ruling A.** Adopt the software-only operating-context capability matrix in §9.3. `shipper_owned`
> and `facility_operator` receive the enumerated read/write sets, fail-closed, enforced in policy,
> RLS, event envelope, and database CHECK. `autonomous_mobility` is defined but unexercised in
> Phase 1 and is held at a standing `legal_plane` kill switch of `suspended`. Carrier appointment is
> not required and not permitted in any of the three. Record as ADR-0019.

> **Ruling B.** RigReceipts remains contract and simulation only for all of Phase 1. No live
> credential, no live read, no live write. All business formulas are marked externally supplied and
> unresolved. `RIGRECEIPTS_LIVE_ENABLED` is a mandatory-false flag asserted by
> `scripts/validate-scope.mjs`. Providing an authoritative RigReceipts methodology document remains
> an owner deliverable.

> **Ruling C.** RIGDESK remains contract and simulation only for all of Phase 1. FreightOS consumes
> restrictions and may prepare recommendations at A2; it may not diagnose, approve, schedule, or
> release maintenance. Unknown maintenance state renders equipment **not active**.
> `RIGDESK_LIVE_ENABLED` is a mandatory-false flag. Providing an authoritative RIGDESK contract
> remains an owner deliverable.

> **Ruling D.** Control-plane access uses the hybrid model: the existing `app.is_control_plane()`
> policy branch as the isolation mechanism, plus an `admin` schema of narrowly scoped
> `SECURITY DEFINER` functions as the sole entry point, plus a dedicated connection and credential,
> plus mandatory audit emission per privileged call. `BYPASSRLS` is prohibited. New domain tables
> receive no control-plane grant by default. Record as ADR-0020.

> **Ruling E.** Phase 1 implements abstract EDI interfaces and canonical-format synthetic fixtures
> only. No X12 syntax, code list, segment layout, or implementation-guide content enters the
> repository. Non-X12 canonical JSON ingestion is the first working road-adapter path. X12 maps are
> deferred until licensing is obtained and an integration-registry row is completed.

Three further rulings are needed that are not Decisions A–E but block the same work:

> **Ruling F — common-field contract completion.** `adr/0017:48-57` omits `organization_node_id` and
> `legal_entity_id`, which `04_…:29-31` and `07_…:5` mandate on tenant-owned records. Extend the
> contract for Phase 1 domain tables: `organization_node_id` `NOT NULL` on records scoped to a node,
> `legal_entity_id` `NOT NULL` except under system scope. Record as an amendment to ADR-0017.

> **Ruling G — geospatial representation.** ADR-0016 fixes PostgreSQL 16 but selects no geospatial
> extension, while Specification 3 requires geospatial representation for locations and facilities.
> Recommendation: **no PostGIS in Phase 1.** Store `latitude`/`longitude` as `numeric` with a
> `geo_precision` and `geo_source` field, plus an opaque `external_geo_reference`. Defer PostGIS to
> the first phase that needs spatial query (routing, Phase 2+), behind its own ADR. Rationale: adding
> an extension is additive and reversible; adding it speculatively pins an operational dependency for
> no Phase 1 benefit.

> **Ruling H — package-path clarification.** `21_…:161-171` lists nine allowed `packages/` paths.
> Phase 0 created `packages/config`, `packages/context`, `packages/database`, `packages/schemas`,
> none of which appear on it. Confirm the reading that the list enumerates the _modal and
> deferred-contract_ packages specifically permitted, and does not exhaustively bound the workspace.
> Phase 1 will add `packages/domain-*`, `packages/modal-core`, `packages/mode-road`,
> `packages/facility-primitives`, `packages/rigreceipts-contract`, `packages/rigdesk-contract`.

---

## 6. The ten draft specifications

Each is implementation-ready in structure and explicitly incomplete where an owner input is
missing. Nothing below is a migration or code.

### Specification 1 — Identity and organization model

**Aggregates.** `OrganizationNode` (self-referencing tree), `LegalEntity`, `OperatingAuthority`,
`User`, `Membership`, `Role`, `Permission`, `RolePermission`, `ServiceAccount`, `PolicyBinding`.

**Primary identifiers.** All `uuid` primary keys, `gen_random_uuid()` default, per `adr/0017:50`.
Human-facing external references are separate nullable `text` columns, never the key.

**Tenant ownership.** Every table carries `tenant_id uuid NOT NULL`, the RLS discriminator.
`tenants` already exists (`packages/database/migrations/0002_tenants.up.sql`) and is not recreated.

**Organization hierarchy.** One `organization_nodes` table with
`node_type ∈ {enterprise, legal_entity, operating_authority, business_unit, region, terminal,
fleet, cost_center}` — the eight types at `04_…:5-14`, matching `db/reference/0001:4-7`. `parent_id`
is a self-reference. Constraints:

- Exactly one `enterprise` node per tenant with `parent_id IS NULL`.
- A cycle-prevention check. Recommendation: a materialized `path` (`ltree`-style text or an
  ancestor closure table) maintained by trigger, with a `CHECK` that a node never appears in its own
  ancestor set. **Owner input not required**; engineering picks the mechanism, but the invariant is
  mandatory and must be tested.
- `depth` maintained by trigger, bounded (recommend 16) so a pathological tree cannot make
  inheritance resolution unbounded.
- Node-type ordering is **not** enforced as a rigid ladder. `04_…:16` says drivers, equipment,
  users, policies, contracts, and reports "can be scoped to any valid node", and `00_…:116-124`
  shows the canonical nesting as illustrative. Enforce parenthood validity per type via a
  small permitted-parent table, not a hard-coded chain.

**Membership.** `memberships` links `user_id` × `organization_node_id` × `role_id`, with
`effective_from`/`effective_to` (see effective dating, Specification 2). A user may hold several.

**Roles and permissions.** `roles` is tenant-owned and may be system-seeded; `permissions` is a
control-plane catalog (one of the few legitimate control-plane grants under Ruling D);
`role_permissions` joins them. Permission strings are the canonical action vocabulary —
**and it does not yet exist.** `docs/governance/POLICY_REGISTRY.md` gap 7 records a collision
between `config/agents/registry.yaml` action strings and `config/policy/base_policy.yaml`. Phase 1
must define the vocabulary for the Phase 1 action set only, and record that Phase 2 extends it.

**Service accounts.** `service_accounts` carries `tenant_id`, `organization_node_id`,
`legal_entity_id`, a role binding, and a credential _reference_ — never a credential
(`02_…:58`, `DATA_CLASSIFICATION.md` class `SECRET`). Service accounts are always non-human actors;
`audit_events.actor_type` for them is `integration` or `system`.

**Policy inheritance.** `04_…:18-22`: policies inherit downward; a child may tighten but cannot
weaken legal, safety, enterprise-minimum, security, residency, or approval controls; every
effective policy records inherited source and local override. Model:

- `policy_bindings(organization_node_id, policy_id, policy_version, direction)` where
  `direction ∈ {inherited, local_override}`.
- Resolution walks root → leaf and applies the **most restrictive** value per control, mirroring
  the kill-switch precedence rule in `packages/database/migrations/0004_kill_switches.up.sql:151`.
- A `protected_controls` list names the six categories a child may never weaken; an attempted
  weakening is rejected at write time, not filtered at read time.
- `effective_policy` resolution returns, for each control, the value **and** the node it came from.

**Legal-entity association.** `legal_entities` is tenant-owned and associated to an
`organization_node_id`. `operating_authorities` hangs off a legal entity and carries
`legal_authority_class` (ADR-0015), `authority_type`, `authority_number`, `status`,
`effective_at`, `expires_at`. The `carrier_agent` appointment evidence
(`packages/context/src/legal.ts:47-50` — `carrierId` + `carrierAppointmentId`) is stored as
`carrier_appointments`, linking a legal entity to a carrier profile with document evidence and a
validity window. **This is the table that makes `carrier_agent` context provable rather than
asserted.**

**Common record fields.** Per `adr/0017:48-57` plus Ruling F: `id`, `tenant_id`,
`organization_node_id`, `legal_entity_id`, `legal_authority_class`, `operating_context`,
`created_at`, `updated_at`, `created_by`, `version`.

**RLS predicates.** Base predicate on every table:
`app.is_control_plane() OR tenant_id = app.current_tenant_id()`, with `ENABLE` + `FORCE`, `USING`
and `WITH CHECK`, copying `0002_tenants.up.sql:45-50`. Additional predicates:

- `users`, `memberships`, `service_accounts` — plus a node-visibility predicate: a caller may see
  memberships at or below the nodes it administers.
- `permissions` — control-plane read for all, tenant read of its own bindings.

**Control-plane access.** Under Ruling D: **grants only on** `permissions` (catalog) and a narrow
`admin.provision_tenant(...)` function. `users`, `memberships`, `legal_entities`,
`operating_authorities`, `carrier_appointments` get **no** control-plane grant.

**Audit events.** Emit on: organization node create/move/archive, legal entity create/status
change, operating authority create/status/expiry, user create/deactivate, membership grant/revoke,
role create/modify, permission grant/revoke, service-account create/rotate/revoke, policy binding
create/override/remove, carrier appointment create/expire/revoke. Event types follow the Phase 0
pattern `^rig\.freight\.[a-z0-9_.-]+\.v[0-9]+$`
(`0003_audit_and_outbox.up.sql:23`).

---

### Specification 2 — Carrier and fleet model

**Entities.** `CarrierProfile`, `Driver`, `PoweredUnit`, `NonpoweredEquipment`,
`EquipmentCapability`, `AvailabilityWindow`, `MaintenanceRestriction`, `Assignment`.

**CarrierProfile.** Tenant-owned. Carries legal-entity association, authority references (DOT/MC
numbers as opaque `text`, never validated against a live registry in Phase 1), operating status,
insurance references (as document references, not documents), and safety-rating **references**.
FreightOS does not compute a safety rating.

**Driver.** `PERSONAL` data class (`docs/governance/DATA_CLASSIFICATION.md`) — prohibited from
development copies and from model providers beyond minimum necessary redacted context. Fields:
identity, employment/contract relationship to a carrier profile, licence class and endorsements as
capability _references_, home terminal (`organization_node_id`), status. Hours-of-service is
**out of scope for Phase 1** — it is an ELD/telematics integration (`11_…:19`, not registered).

**PoweredUnit / NonpoweredEquipment.** Deliberately two tables, not one, because
`05_…:29` distinguishes powered status and because the active-powered-unit meter counts only
the former. Both reference `EquipmentCapability` rows rather than carrying boolean columns —
`05_…:41`: _"New profiles are registry data, not schema migrations."_

**EquipmentCapability.** A registry, not an enum. Rows describe capability _kinds_ drawn from
`05_…:29-40`: mode/powered status, dimensions/capacity, axle/deck, access/loading, temperature
zones, liquid/dry bulk, pressure/food-grade/hazmat, securement, container/chassis/rail/ro-ro,
gauge/permits, sensors/telematics. Equipment ↔ capability is a join table with typed values.
**The seed vocabulary is an owner/domain deliverable** — Phase 1 defines the mechanism and seeds
only the dry-van FTL subset the initial slice needs (`00_…:132-134`).

**AvailabilityWindow.** `(equipment_or_driver_ref, starts_at, ends_at, availability_type, source)`.
Overlapping windows for the same subject and type are rejected by an exclusion constraint. Sources
are `manual`, `derived`, or `simulation` — never a live telematics feed in Phase 1.

**MaintenanceRestriction.** Per Decision C: `subject_ref`, `restriction_type`, `severity`,
`effective_from`, `effective_to` (nullable = open-ended), `authoritative_source NOT NULL`,
`observed_at NOT NULL`, `external_reference`, `evidence`. **Fail-closed asymmetry:** a restriction
from a non-authoritative source may make a unit unavailable but may never make it available.

**Assignment.** Links a driver, a powered unit, optional nonpowered equipment, and (later) a
transport leg, over a validity window. In Phase 1 an assignment is a **record**, not a dispatch —
creating one performs no external action (`prompts/PHASE_1_UNIVERSAL_CORE.md:7`).

**Status vocabularies.** Each entity gets an explicit, closed status set, stored as a PostgreSQL
enum in the `app` schema, with transitions governed by Specification 5. Recommended:

- CarrierProfile: `prospective → active → suspended → inactive`
- Driver: `onboarding → active → leave → suspended → separated`
- PoweredUnit / NonpoweredEquipment: `registered → available → assigned → in_service →
out_of_service → archived`
- Assignment: `planned → confirmed → active → completed → cancelled`

**Effective dating.** Required for: memberships, policy bindings, operating authorities, carrier
appointments, availability windows, maintenance restrictions, assignments, and capability
associations. Pattern: `effective_from timestamptz NOT NULL`, `effective_to timestamptz` nullable,
a `CHECK (effective_to IS NULL OR effective_to > effective_from)`, and an exclusion constraint
preventing overlap where overlap is meaningless. Queries take an explicit as-of timestamp;
**there is no implicit "now" in a domain query**, because a profitability calculation must be
reproducible against the inputs it actually used.

**Active-powered-unit definition.** `03_PRICING_AND_BILLING.md:59-61` gives the commercial rule:
_"An asset is billable when it is available, optimized, assigned, tracked, or operated through
FreightOS. Enterprise quantity is the greater of the contracted minimum or monthly average daily
active powered units. Archived/inactive assets are not billed."_

Proposed deterministic definition for Phase 1:

> A powered unit is **active on a given calendar day, in a given tenant and time zone**, if all
> hold: (a) its status is not `archived` and not `registered`; (b) at least one of — an
> `AvailabilityWindow` overlaps the day, an `Assignment` overlaps the day, or a tracked observation
> exists for the day; (c) no `MaintenanceRestriction` of severity `out_of_service` covers the entire
> day; (d) its maintenance state is **known** — an unknown state yields not-active (Decision C).
>
> `active_powered_units(month) = round_half_even( sum over days of daily_active_count / days_in_month )`
>
> The billable quantity would be `max(contracted_minimum, active_powered_units(month))` — **and is
> not computed in Phase 1**, because no contract or billing account exists.

**Explicit billing constraint.** This calculation **must not activate billing**. Phase 1 produces
a deterministic, replayable metering _basis_ only. Concretely, Phase 1:

- computes and stores a daily `active_powered_unit_observation` row per unit per day, with the
  inputs that produced it and a `calculation_version`;
- does **not** create a `meter_events` row, a `billing_account`, an `entitlement`, an
  `invoice`, or a `usage_aggregate`;
- does **not** flip any `billing_enabled` flag — `BILLING_DISABLED=PASS` must still hold in CI;
- records the open questions from `checklists/HORIZON_1_PRODUCTION_RELEASE_GATE.md` §Metering
  correctness as unresolved: no meter is defined anywhere in the package, and
  `meter-event.schema.json` `exclusiveMinimum: 0` structurally blocks a negative correction.

A test must assert that after the full Phase 1 suite runs, `meter_events` (if the table exists at
all — it should not) is empty and no product is billing-enabled.

---

### Specification 3 — Parties and locations

**Party types.** One `parties` table with `party_type ∈ {shipper, consignor, consignee, receiver,
carrier, broker, facility_operator, notify_party, bill_to, other}`. A party is a **role-bearing
commercial identity**, distinct from a `LegalEntity` (which is the tenant's own legal structure)
and from a `CarrierProfile` (which is a carrier the tenant works with). `party_roles` associates a
party to a shipment/consignment/leg with a role — `05_…:13` lists `Party` and `PartyRole`
separately, and this is why.

**Location types.** `locations` with `location_type ∈ {address, facility, terminal, yard, port,
rail_ramp, airport, geographic_zone, other}`. **`Facility` is a specialization of `Location`, not a
sibling** — `19_…:236` is explicit: _"A facility is not represented only as a latitude/longitude or
generic stop."_ Model: `facilities` has a mandatory `location_id` and adds operational structure.

**Addresses.** Stored structurally (`line1`, `line2`, `locality`, `region`, `postal_code`,
`country_code` as ISO 3166-1 alpha-2), never as a single free-text blob. A nullable
`unstructured_address` preserves what was received when parsing fails, so ingestion never loses
data.

**Geospatial representation.** Per Ruling G: `latitude numeric(9,6)`, `longitude numeric(9,6)`,
`geo_precision ∈ {exact, rooftop, centroid, postal, city, unknown}`, `geo_source`, and
`external_geo_reference text`. No PostGIS in Phase 1. A `CHECK` bounds latitude to [-90, 90] and
longitude to [-180, 180].

**Contacts.** `contacts` is `PERSONAL` class. Associated to a party or a location, with
`contact_type`, name, and channel references. Channel values (phone, email) are `PERSONAL` and
subject to the redaction rules in `DATA_CLASSIFICATION.md`.

**Hours.** `operating_hours` rows keyed to a location or facility, expressed as a recurring rule
(day-of-week + open/close local time) plus dated exceptions (holidays, closures). A **time zone is
mandatory** on any location that carries hours — detention arithmetic (Specification 6) is wrong
without it.

**Restrictions.** `location_restrictions` / `facility_restrictions`:
`restriction_type`, `value`, `unit`, `authoritative_source NOT NULL`, `observed_at NOT NULL`,
`version`. `02_…:85` forbids _inventing_ facility geometry, clearances, restrictions, ODD
eligibility, or vehicle readiness — so provenance is mandatory and a restriction with no source
cannot be created.

**External identifiers.** `party_external_identifiers` / `location_external_identifiers`:
`(scheme, value, issuing_authority, verified_at)`. Schemes are open text in Phase 1 (DOT, MC, SCAC,
DUNS, GLN, tenant-local). **No scheme is validated against a live registry in Phase 1.**

**Tenant-owned vs shared.** Recommendation: **everything is tenant-owned in Phase 1.** No shared
party or location registry. Rationale: Constitution Art. III.2 makes cross-tenant economics leakage
the named prohibition, and a shared location registry is the easiest accidental channel for it
(volume patterns at a facility reveal a competitor's operations). A shared reference registry, if
ever wanted, is an ADR with a privacy review — not a Phase 1 default.

**Deduplication boundaries.** Deduplicate **within a tenant only**, and never automatically merge:
Phase 1 detects candidate duplicates (same external identifier + scheme; or normalized address +
name similarity above a threshold) and records a `party_duplicate_candidate` row for human review.
Automatic merge is prohibited — merging parties silently rewrites the counterparty on historical
shipments.

**Privacy classification.** `parties` → `TENANT_CONFIDENTIAL`; `contacts` → `PERSONAL`;
`locations`, `facilities` → `TENANT_CONFIDENTIAL`. `docs/governance/DATA_CLASSIFICATION.md` must be
extended in the same PR — its Phase 0 inventory ends with _"Phase 0 stores no `PERSONAL` and no
`TENANT_ECONOMICS` data. Both arrive in Phase 1… and this register must be extended in the same
change."_

**Relationships to legs and facilities.** A `TransportLeg` references an origin and destination
`location_id`. A `Stop` references a `location_id` and optionally a `facility_id`. An `Appointment`
references a `facility_id`. `PartyRole` binds parties to shipments, consignments, and legs.

---

### Specification 4 — Freight object model

**Relationships.**

```text
Shipment  (commercial movement requirement — 05_…:5)
├── Consignment*        goods transported and documented together (05_…:8)
│   └── CargoItem*      what the goods are
├── HandlingUnit*       physical grouping: pallet, container, package, tank, ULD (05_…:9)
│   └── CargoItem*      via handling_unit_contents (many-to-many)
├── PartyRole*          shipper, consignee, bill-to, notify
├── Document*           references only; bytes live in object storage
├── Exception*          linked cases (07_…:47)
└── TransportJourney    exactly one in Phase 1; the model permits many
    └── TransportLeg*   ordered, mode-specific (05_…:7)
        ├── Stop*       ordered stops on the leg
        │   └── Milestone*
        ├── CustodyEvent*
        └── ModalExtension  versioned, per-mode (05_…:19)
```

**Cardinalities and rules.**

- `Shipment : TransportJourney` is 1:N in the model, 1:1 in Phase 1 (enforced by a Phase 1-only
  unique index that a later phase drops, not by a schema shape that assumes one).
- `TransportJourney : TransportLeg` is 1:N with a unique `(journey_id, sequence_number)` —
  matching `db/reference/0002:63`.
- Leg contiguity: leg _n_'s destination location must equal leg _n+1_'s origin location, or an
  explicit `interchange` record must exist. Enforced as a validation at journey activation, not as
  a `CHECK` (a journey under construction is legitimately incomplete).
- A `CargoItem` belongs to exactly one `Consignment`. A `HandlingUnit` may carry items from several
  consignments; the join carries the quantity.
- `00_…:111` is binding: **no core table may assume one truck, one carrier, one leg, a road
  address, owned equipment, or closed freight/trailer enums.** Every Phase 1 core table must be
  reviewed against that sentence explicitly, and the review recorded in the PR.

**Lifecycle rules.**

- A shipment cannot leave `DRAFT` without at least one consignment, at least one cargo item, an
  origin and destination, and a shipper party role.
- A journey cannot activate without at least one leg.
- A leg cannot activate without a performing party, an origin, and a destination.
- Custody events are **append-only** — a custody transfer is evidence, and evidence is not edited.
  Same trigger pattern as `audit_events` (`0003_audit_and_outbox.up.sql:53-65`).
- Milestones are append-only observations; the _derived_ leg status is a projection over them plus
  explicit transitions.
- Documents are references (`06_…:83` — "pointers instead of duplicated sensitive documents").
  The row carries `document_type`, `storage_reference`, `content_hash`, `issued_at`, `source`, and
  `classification`.
- Exceptions are linked cases (`07_…:47`) with their own lifecycle (Specification 5), not a status
  value on the shipment.

**Naming drift resolved without editing the handoff.** ADR-0014 §3 forbids editing the preserved
package, so these are resolved by _decision recorded here_ plus a glossary addition at
`docs/governance/` — never by touching `docs/production-handoff/v1.2/`.

| Drift                                                               | Sources                                                                                             | Phase 1 canonical name                                                                                                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Journey` vs `TransportJourney`                                     | `07_…:15` vs `05_…:6`, `00_…:97`                                                                    | **`TransportJourney`** / table `transport_journeys`                                                                                                                              |
| `TransportSegment`                                                  | listed at `05_…:13`, defined nowhere                                                                | **Not created.** `TransportLeg` is the only segment concept in Phase 1                                                                                                           |
| `CustodyTransfer` vs custody event                                  | `07_…:75`, `db/reference/0005:139` vs `schemas/custody-event.schema.json`                           | **`CustodyEvent`** / table `custody_events`. Rationale: it is an append-only evidence record, and "transfer" implies a mutable process object                                    |
| `Discrepancy` vs `Delivery discrepancy` vs `facility_discrepancies` | `07_…:75`, `db/reference/0005:171`                                                                  | **`DeliveryDiscrepancy`** / table `delivery_discrepancies`                                                                                                                       |
| `InventoryCommitment` vs `CargoReadiness`                           | `07_…:75` lists both; `db/reference/0005:60` implements only the former, carrying a readiness field | **`CargoReadiness`** in Phase 1. `InventoryCommitment` is a warehouse-inventory concept and is **out of scope** — creating it edges toward the WMS replacement `21_…:89` forbids |
| `ExceptionCase` vs `Exception`                                      | `07_…:23` vs `05_…:13`                                                                              | **`Exception`** / table `exceptions`                                                                                                                                             |
| `Stop`                                                              | named at `05_…:13`, `07_…:15`; never defined                                                        | **Defined here** as an ordered position on a leg with a location, a stop type, planned/actual windows, and milestones                                                            |
| `NonpoweredEquipment` vs `TransportEquipment`                       | `07_…:19` vs `05_…:13`                                                                              | **`NonpoweredEquipment`** for road Phase 1; `TransportEquipment` is reserved as the multimodal superset                                                                          |
| `authority_mode`                                                    | `04_…:31`, `07_…:5`, `config/policy/base_policy.yaml`, `schemas/custody-event.schema.json`          | **`legal_authority_class` + `operating_context`** — ADR-0015. See contradiction C1                                                                                               |

---

### Specification 5 — State-transition matrices

Every Phase 1 state machine, with authorized actor, required context, evidence, approval, emitted
event, idempotency, and invalid-transition response. Common rules first.

**Universal transition rules.**

- **Authorized actor** is a permission string plus an actor type. In Phase 1 every consequential
  transition is `human` or `system`; **no transition may be performed by an `agent` actor**,
  because the A2 ceiling forbids execution.
- **Required context** always includes a valid `(legal_authority_class, operating_context)` pair
  and the tenant. `packages/database/src/session.ts:56` (`withLegalContext`) is the only sanctioned
  entry point.
- **Idempotency.** Every transition command carries a client-supplied `idempotency_key` and an
  `expected_version`. A replay with the same key and the same parameters returns the original
  result with `replayed: true` and emits **no** second event. A replay with the same key and
  _different_ parameters is an error (`409 IDEMPOTENCY_KEY_REUSED`).
- **Optimistic concurrency.** `expected_version` mismatch → `409 VERSION_CONFLICT` with the current
  version. The database owns `version` (`0001_platform_foundation.up.sql:173-184`).
- **Invalid transition** → `422 INVALID_STATE_TRANSITION` naming current state, attempted target,
  and the permitted targets. **The attempt is audited**, because a rejected transition is exactly
  the signal that matters in an incident.
- **Emitted event** is written to `outbox_events` in the same transaction as the state change
  (`0003_audit_and_outbox.up.sql:84-86`), plus an `audit_events` row.
- **Terminal states accept no outbound transition**, including to themselves.

**5.1 Load Opportunity** — `07_…:37-41` gives
`INGESTED → NORMALIZED → VALIDATED → ELIGIBLE → SCORED → RECOMMENDED → NEGOTIATING → ACCEPTED →
CONVERTED`, terminal `REJECTED, EXPIRED, WITHDRAWN, DUPLICATE, INELIGIBLE`.

**Phase 1 implements only `INGESTED → NORMALIZED → VALIDATED → ELIGIBLE` plus the terminal set.**
`SCORED` onward requires the scoring runtime (Phase 2) and `NEGOTIATING`/`ACCEPTED` require
consequential external action (Phase 3). The enum carries all values; the transition table refuses
the Phase 2+ ones with `422 NOT_AUTHORIZED_IN_PHASE`, which is a _stronger_ guarantee than
omitting them.

| From             | To           | Actor               | Context                   | Evidence                           | Approval | Event                          | Idempotency                      |
| ---------------- | ------------ | ------------------- | ------------------------- | ---------------------------------- | -------- | ------------------------------ | -------------------------------- |
| —                | `INGESTED`   | system, integration | `carrier_agent`/`carrier` | raw payload reference, source id   | No       | `load_opportunity.ingested.v1` | source message id                |
| `INGESTED`       | `NORMALIZED` | system              | same                      | normalization ruleset version      | No       | `…normalized.v1`               | opportunity id + ruleset version |
| `INGESTED`       | `DUPLICATE`  | system              | same                      | matched opportunity id             | No       | `…duplicate_detected.v1`       | as above                         |
| `NORMALIZED`     | `VALIDATED`  | system              | same                      | validation result set              | No       | `…validated.v1`                | opportunity id                   |
| `NORMALIZED`     | `INELIGIBLE` | system              | same                      | failed rule ids                    | No       | `…ineligible.v1`               | opportunity id                   |
| `VALIDATED`      | `ELIGIBLE`   | system              | same                      | eligibility rule ids passed        | No       | `…eligible.v1`                 | opportunity id                   |
| `VALIDATED`      | `INELIGIBLE` | system, human       | same                      | rule ids or human reason           | No       | `…ineligible.v1`               | opportunity id                   |
| any non-terminal | `EXPIRED`    | system              | same                      | expiry timestamp vs offer validity | No       | `…expired.v1`                  | opportunity id + expiry ts       |
| any non-terminal | `WITHDRAWN`  | system, integration | same                      | source withdrawal message          | No       | `…withdrawn.v1`                | source message id                |
| any non-terminal | `REJECTED`   | human               | same                      | reason code                        | No       | `…rejected.v1`                 | opportunity id + actor + reason  |
| `ELIGIBLE`       | `SCORED`     | —                   | —                         | —                                  | —        | —                              | **Refused in Phase 1**           |

**Prohibited:** any transition into `SCORED`, `RECOMMENDED`, `NEGOTIATING`, `ACCEPTED`, `CONVERTED`;
any backward transition; any transition out of a terminal state.

**5.2 Shipment** — `07_…:45`:
`DRAFT → TENDERED → ACCEPTED → ASSIGNED → DISPATCHED → EN_ROUTE_TO_PICKUP → AT_PICKUP → LOADED →
IN_TRANSIT → AT_DELIVERY → DELIVERED → DOCUMENTS_COMPLETE → INVOICED → PAID → CLOSED`.

Phase 1 authorizes `DRAFT → TENDERED → ACCEPTED → ASSIGNED` **as records only** — the tender is
recorded, not sent (`prompts/PHASE_1_UNIVERSAL_CORE.md:7`). Execution states from `DISPATCHED`
onward may be _recorded from observation_ (a milestone arriving through ingestion) but may not be
_commanded_. `INVOICED` and `PAID` are refused in Phase 1: no invoicing exists and billing is
disabled.

| From                     | To                   | Actor                | Context                                                      | Evidence                                                         | Approval         | Event                                |
| ------------------------ | -------------------- | -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------- | ------------------------------------ |
| —                        | `DRAFT`              | human, system        | `carrier_agent`/`carrier` or `software_only`/`shipper_owned` | ≥1 consignment, ≥1 cargo item, origin, destination, shipper role | No               | `shipment.created.v1`                |
| `DRAFT`                  | `TENDERED`           | human                | `carrier_agent`/`carrier`                                    | tender record + counterparty party role                          | No (record only) | `shipment.tender_recorded.v1`        |
| `TENDERED`               | `ACCEPTED`           | human                | same                                                         | acceptance evidence reference                                    | No (record only) | `shipment.acceptance_recorded.v1`    |
| `ACCEPTED`               | `ASSIGNED`           | human                | same                                                         | valid `Assignment` covering the leg window                       | No               | `shipment.assigned.v1`               |
| `ASSIGNED`               | `DISPATCHED`         | —                    | —                                                            | —                                                                | —                | **Refused in Phase 1** (A3, Phase 3) |
| `DISPATCHED`…`DELIVERED` | next                 | system (observation) | same                                                         | milestone with source + observed_at                              | No               | `shipment.status_observed.v1`        |
| `DELIVERED`              | `DOCUMENTS_COMPLETE` | human, system        | same                                                         | all required document references present                         | No               | `shipment.documents_complete.v1`     |
| `DOCUMENTS_COMPLETE`     | `INVOICED`           | —                    | —                                                            | —                                                                | —                | **Refused in Phase 1**               |
| any                      | `CLOSED`             | human                | same                                                         | closure reason                                                   | No               | `shipment.closed.v1`                 |
| any non-terminal         | `CANCELLED`          | human                | same                                                         | cancellation reason                                              | No               | `shipment.cancelled.v1`              |

**Prohibited:** skipping from `DRAFT` past `ASSIGNED`; any transition that would send a
communication; `INVOICED`/`PAID` in Phase 1; reopening `CLOSED`.

**5.3 Consignment.** `DRAFT → CONFIRMED → IN_CUSTODY → DELIVERED → RECEIPTED`; alternatives
`SHORT`, `DAMAGED`, `REJECTED`, `CANCELLED`. A consignment cannot reach `IN_CUSTODY` without a
`carrier_custody_accepted` custody event; cannot reach `RECEIPTED` without a `GoodsReceipt`.
Evidence: custody event id, goods receipt id. Actor: human or system-from-observation. Events:
`consignment.<state>.v1`.

**5.4 Transport Journey.** `PLANNED → ACTIVE → COMPLETED`; alternatives `CANCELLED`, `SUSPENDED`.
`PLANNED → ACTIVE` requires ≥1 leg, each with origin, destination, and performing party, and
requires leg contiguity to validate. `ACTIVE → COMPLETED` requires every leg terminal.

**5.5 Transport Leg.** `PLANNED → ASSIGNED → AT_ORIGIN → LOADED → IN_TRANSIT → AT_DESTINATION →
UNLOADED → COMPLETED`; alternatives `CANCELLED`, `EXCEPTION_HELD`. `PLANNED → ASSIGNED` requires a
valid `Assignment` and — under `carrier_agent` — a valid carrier appointment. Equipment
compatibility (Specification 7) must pass or the transition is refused with the failing capability
listed. Backward transitions are prohibited except `EXCEPTION_HELD → <prior state>` on exception
resolution, which requires a human actor and a resolution record.

**5.6 Assignment.** `PLANNED → CONFIRMED → ACTIVE → COMPLETED`; alternatives `CANCELLED`,
`SUPERSEDED`. `PLANNED → CONFIRMED` requires: driver active, powered unit not `out_of_service`, no
`out_of_service` maintenance restriction covering the window, and an availability window covering
it. **`CONFIRMED` performs no external action in Phase 1** — it does not notify the driver.

**5.7 Appointment.** `19_…:270-276`:
`REQUESTED → CAPACITY_CHECKING → PROPOSED → CONFIRMED → VEHICLE_ASSIGNED → ARRIVAL_TRACKING →
CHECKED_IN → YARD_ASSIGNED → DOCK_ASSIGNED → SERVICE_STARTED → SERVICE_COMPLETE → CHECKED_OUT →
CLOSED`; alternatives `REJECTED`, `CANCELLED`, `RESCHEDULED`, `MISSED`, `FACILITY_HOLD`,
`CARRIER_HOLD`.

Actors by context (Decision A): `REQUESTED` by carrier or shipper; `CAPACITY_CHECKING`,
`PROPOSED`, `CONFIRMED`, `REJECTED`, `FACILITY_HOLD` by `facility_operator`; `CARRIER_HOLD`,
`CANCELLED` by carrier. Evidence: `CONFIRMED` requires a committed window; `CHECKED_IN` requires a
vehicle-visit reference; `DOCK_ASSIGNED` requires a dock reference; `SERVICE_COMPLETE` requires
load/unload completion events. `RESCHEDULED` creates a new appointment linked by
`supersedes_appointment_id` rather than mutating the original — **rescheduling must not erase the
original committed window, because detention entitlement depends on it.**

`FACILITY_HOLD` and `CARRIER_HOLD` are enterable from any non-terminal state and exit only to the
state they entered from, or to `CANCELLED`. **A hold may not be released by an agent** (`02_…:86`).

**5.8 Vehicle Visit.** `EXPECTED → ARRIVED → CHECKED_IN → STAGED → AT_DOCK → SERVICE_STARTED →
SERVICE_COMPLETE → CHECKED_OUT → DEPARTED`; alternatives `TURNED_AWAY`, `ABANDONED`. Actor:
`facility_operator` for every transition except `EXPECTED` (carrier). Evidence: `CHECKED_IN`
requires gate reference and credential; `AT_DOCK` requires dock reference; `SERVICE_*` link to
load/unload events. **A gate/staging/dock reference is a record of an assignment made elsewhere,
never a command to a facility system** — `21_…:81` says "references", and
`schemas/facility-adapter.schema.json` `commands` enum values such as `yard_target.assign` are
outbound commands and therefore **out of Phase 1 scope** (see contradiction C7).

**5.9 Cargo Readiness.** `19_…:262-266`:
`PLANNED → INVENTORY_ALLOCATED → PICKING → PICKED → PACKED → STAGED → RELEASED →
READY_FOR_LOADING`; alternatives `SHORT`, `DAMAGED`, `QUALITY_HOLD`, `CUSTOMS_HOLD`,
`CUSTOMER_HOLD`, `NOT_READY`.

Actor: `shipper_owned` or `facility_operator`. **FreightOS never infers readiness** — every
transition requires an explicit source and `observed_at`, and `14_…:65` forbids stale readiness
silently authorizing dispatch. Enforcement: a readiness record older than a configured freshness
window is treated as `NOT_READY` for any downstream gate, and the staleness is surfaced, not
hidden. Holds (`QUALITY_HOLD`, `CUSTOMS_HOLD`, `CUSTOMER_HOLD`) are human-release only.

**5.10 Custody.** `19_…:280-285`:
`SHIPPER_CONTROL → RELEASE_AUTHORIZED → LOADING_VERIFIED → CARRIER_CUSTODY → DELIVERY_PRESENTED →
RECEIVER_INSPECTION → RECEIVER_ACCEPTED`; alternatives `PARTIALLY_ACCEPTED`, `REJECTED`, `DAMAGED`,
`SHORT`, `OVER`, `SEAL_EXCEPTION`, `CLAIM_OPENED`.

Custody state is a **projection over an append-only `custody_events` table**, not a mutable column.
Every event requires, per `19_…:154-162` and `schemas/custody-event.schema.json`: shipment,
consignment/handling units, releasing and accepting party, facility, occurred-at, condition,
quantity, seal, **at least one evidence item** (`minItems: 1`), and the legal pairing. `14_…:66`:
custody transitions require authorized parties and evidence. `01_CONSTITUTION.md:75` (Art. IX.5):
custody transfer cannot be inferred solely from communication — so an email reference alone is not
sufficient evidence, and the evidence type vocabulary must distinguish `communication` from
`signature`, `photograph`, `scan`, `sensor`, `machine_credential`.

Corrections are **compensating events**, never edits (append-only trigger, as `audit_events`).

**5.11 Detention.** _No state machine exists anywhere in the handoff._ `DetentionClock` is named at
`07_…:75` and `19_…:233` and nowhere elaborated. Proposed:

`NOT_STARTED → RUNNING → PAUSED → STOPPED → EVIDENCED → DISPUTED → RESOLVED`; terminal `RESOLVED`,
`VOIDED`.

| From               | To          | Trigger                                                       | Actor                        | Evidence                                                    |
| ------------------ | ----------- | ------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `NOT_STARTED`      | `RUNNING`   | free time elapses after the clock-start event                 | system                       | clock-start event id, free-time rule id, facility time zone |
| `RUNNING`          | `PAUSED`    | facility closure inside the window, or a carrier-caused delay | `facility_operator` or human | reason code + interval                                      |
| `PAUSED`           | `RUNNING`   | pause condition ends                                          | system                       | interval end                                                |
| `RUNNING`/`PAUSED` | `STOPPED`   | clock-stop event                                              | system                       | clock-stop event id                                         |
| `STOPPED`          | `EVIDENCED` | evidence set complete                                         | human, system                | full evidence bundle                                        |
| `EVIDENCED`        | `DISPUTED`  | counterparty disputes                                         | human                        | dispute reason                                              |
| `DISPUTED`         | `RESOLVED`  | resolution recorded                                           | human                        | resolution record                                           |
| `EVIDENCED`        | `RESOLVED`  | accepted                                                      | human                        | acceptance record                                           |
| any                | `VOIDED`    | recorded in error                                             | human                        | void reason                                                 |

**Clock start** = the later of the committed appointment start and the vehicle-visit `ARRIVED`
timestamp. **Clock stop** = the earlier of `SERVICE_COMPLETE` and `DEPARTED`. Both are derived from
recorded events, never entered directly. **Free-time rules are an owner deliverable** (§16) — the
commercial free-time allowance is contractual and is not in the handoff. Phase 1 ships the
mechanism with a configurable, tenant-scoped, effective-dated `free_time_rules` table and **no
default value**; a detention clock cannot start without an applicable rule.

**Detention produces no charge in Phase 1.** It produces an evidenced duration and an accessorial
_linkage point_. Charge computation is a billing concern and billing is disabled.

**5.12 Delivery Discrepancy.** `REPORTED → UNDER_REVIEW → SUBSTANTIATED → RESOLVED`; alternatives
`DISMISSED`, `ESCALATED_TO_CLAIM`. Actor: `facility_operator` or receiver reports; human reviews.
Evidence: goods receipt reference, quantity delta, condition evidence, photographs.
`ESCALATED_TO_CLAIM` is a **terminal state in Phase 1** — claims are `09_…:21` red actions and
claims settlement is excluded by `00_…:158`. It records that escalation happened and stops.

**5.13 Exception (cross-cutting).** `OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED`; alternatives
`DISMISSED`, `ESCALATED`. Every exception links to exactly one subject (shipment, leg, appointment,
visit, custody event, or discrepancy). Resolution requires a human actor and a resolution record in
Phase 1 — `prepare_response` is a Phase 2 agent capability.

---

### Specification 6 — Minimum facility primitives

Scope is exactly `21_…:77-87`. Anything not on that list is out. `module_states.yaml:18` —
`standalone_product_allowed: false`.

**Facility identity.** `facilities` extends `locations` (Specification 3) with `facility_type`,
operating legal entity, `organization_node_id`, capability references, and provenance. Facility
sub-locations (`gate`, `staging_area`, `dock_door`) are rows in
`facility_operational_locations` with a `location_type` and a parent — **references and structure
only, no geometry authoring** (`02_…:85`).

**Hours and restrictions.** Per Specification 3. Time zone mandatory. Provenance mandatory.

**Appointment model.** Per Specification 5.7. Fields: facility, shipment and/or leg, appointment
type (`pickup`/`delivery`), requested window, committed window, status, `supersedes_appointment_id`,
carrier reference, `version`. Capacity conflict detection is a **check**, not a scheduler — an
overlapping commitment on the same dock in the same window is rejected.

**Cargo-readiness model.** Per Specification 5.9. Fields: shipment/consignment, facility, status,
`authoritative_source NOT NULL`, `observed_at NOT NULL`, `readiness_probability` (nullable, 0–1),
evidence. **No inventory ledger** — recording that goods are ready is in scope; tracking what is in
the warehouse is the WMS replacement `21_…:89` forbids.

**Vehicle-visit model.** Per Specification 5.8. Fields: facility, appointment, powered unit,
nonpowered equipment, operator (driver) reference, gate reference, staging reference, dock
reference, and the four timestamps (`checked_in_at`, `service_started_at`, `service_completed_at`,
`checked_out_at`) plus `arrived_at` and `departed_at`.

**Gate, staging, and dock references.** Each is `(facility_operational_location_id, assigned_at,
assigned_by, source)`. **They record an assignment; they do not make one.** No outbound command.

**Load and unload event model.** `load_unload_events` append-only:
`(vehicle_visit_id, consignment_id, event_type ∈ {load_started, load_completed, unload_started,
unload_completed}, occurred_at, actor, evidence)`. Ordering is enforced: no `*_completed` without a
matching `*_started`; no second `*_started` while one is open.

**Seal model.** `seals`: `(seal_number, seal_type, applied_at, applied_by_party, removed_at,
removed_by_party, status ∈ {applied, intact_verified, broken, missing, mismatched})`, linked to
handling units and/or the equipment. A seal mismatch at delivery **must** produce a
`seal_exception` custody event.

**Custody evidence.** Per Specification 5.10. Evidence types are a closed vocabulary and
`communication` alone never satisfies acceptance (Art. IX.5).

**Detention clock.** Per Specification 5.11.

**Free-time rules.** `free_time_rules`: tenant-scoped, effective-dated, keyed by
`(facility_id | facility_type | counterparty_party_id | default)` with a resolution precedence
(most specific wins), carrying `free_minutes`, `applies_to ∈ {pickup, delivery, both}`,
`business_hours_only boolean`, and `source`. **No default value ships.** Recommendation: the
resolution function returns `NULL` when no rule applies, and a `NULL` result means the clock cannot
start — fail-closed, and it surfaces the missing rule rather than inventing an allowance.

**Clock start and stop events.** Derived, as defined in 5.11. Stored as a `detention_clock` row
referencing the source event ids, so the derivation is reproducible.

**Evidence requirements.** A detention clock reaching `EVIDENCED` requires: appointment with a
committed window, vehicle visit with arrival and departure, the applicable free-time rule version,
the facility time zone, and any pause intervals with reasons.

**Accessorial linkage.** `detention_clocks.accessorial_reference` is a nullable opaque reference
recording _that_ an accessorial applies. Phase 1 computes no amount and creates no charge.

**Goods receipt.** `goods_receipts`: `(shipment_id, consignment_id, facility_id, status, receipt
reference, accepted quantity, rejected quantity, received_by_party, occurred_at, evidence)`.
Append-only; corrections are compensating receipts.

**Delivery discrepancy.** Per Specification 5.12.

**Anti-FacilityOS guardrails, to be enforced in CI.** R-09 records this risk as only partially
mitigated: _"Phase 1 must add a check on the primitive allow-list itself."_ Proposed additions to
`scripts/validate-scope.mjs`:

1. A facility-table allow-list — a new table matching `facility*`, `appointment*`, `vehicle_visit*`,
   `dock*`, `yard*`, `gate*`, `seal*`, `custody*`, `detention*`, `goods_receipt*`,
   `*discrepancy*` must appear on the allow-list or the build fails.
2. No table named for warehouse inventory, labor management, slotting, wave planning, picking, or
   put-away.
3. No outbound facility command surface: the `commands` values in
   `schemas/facility-adapter.schema.json` must not be referenced by any Phase 1 handler.
4. The twelve forbidden control verbs scan already in place must extend over the new packages.

---

### Specification 7 — Road FTL adapter

**Adapter manifest.** Conforms to `schemas/modal-adapter.schema.json` (required: `mode`, `version`,
`entities`, `states`, `documents`, `events`, `billing_meters`; optional `standards`, `policy_packs`,
`agent_tools`).

```yaml
mode: road
version: 1.0.0
entities:
  [RoadLegExtension, RoadStop, RoadEquipmentRequirement, RoadRouteFacts, RoadCommercialFacts]
states:
  [
    PLANNED,
    ASSIGNED,
    AT_ORIGIN,
    LOADED,
    IN_TRANSIT,
    AT_DESTINATION,
    UNLOADED,
    COMPLETED,
    CANCELLED,
    EXCEPTION_HELD,
  ]
documents:
  [bill_of_lading, proof_of_delivery, rate_confirmation, weight_ticket, lumper_receipt, seal_record]
events: [rig.freight.road.leg_planned.v1, …]
billing_meters: [] # empty on purpose — no meter is defined anywhere (release gate)
standards: [X12-204, X12-990, X12-214, X12-210] # named targets, not implementations
policy_packs: [] # Phase 2
agent_tools: [] # Phase 2 — 'agents cannot call unlisted tools' (14_…:31)
```

`billing_meters: []` and `agent_tools: []` are deliberate. `adr/0018:70-72` establishes the
precedent: _"Empty is the honest value."_

**Road-specific extension fields.** Held in `transport_legs.modal_extension jsonb` with
`modal_extension_schema` naming a versioned JSON Schema — matching `db/reference/0002:58-59` and
`05_…:19` (_"Mode-specific fields do not become random nullable core columns"_). Road fields:
equipment requirement, trailer type, temperature range, hazmat class references, weight and
dimension limits, team requirement, drop-and-hook flag, appointment requirements, accessorial
expectations. **Every one is validated against the road extension schema on write.**

**Equipment matching.** A capability-based predicate, not a type equality:
`satisfies(equipment, requirement)` returns a boolean and the failing capability list. Rules:
each required capability must be present with a satisfying value; numeric requirements are
range-checked; absent capability = not satisfied (fail-closed). This function gates
`TransportLeg PLANNED → ASSIGNED` (5.5).

**Stops.** `stops`: `(leg_id, sequence, stop_type ∈ {pickup, delivery, intermediate, fuel, rest,
scale, border}, location_id, facility_id?, planned_window, actual_arrival, actual_departure,
appointment_id?)`. Unique on `(leg_id, sequence)`.

**Route facts.** `road_route_facts`: planned distance, loaded/empty split, planned duration,
`route_source`, `route_version`, `computed_at`. **FreightOS computes no route in Phase 1** —
routing is an integration (`11_…:19`, not registered). Facts are ingested or manually entered, and
`route_source` is mandatory so a downstream profitability calculation knows what it consumed.

**Commercial facts.** `road_commercial_facts`: linehaul rate, fuel surcharge, accessorials,
currency, rate basis, payment terms, **all money in integer minor units** (`07_…:65`). Sourced
from the load opportunity or a rate confirmation document; never inferred.

**Exceptions.** Road exception taxonomy: `late_pickup`, `late_delivery`, `equipment_failure`,
`load_rejected`, `overweight`, `seal_exception`, `damage`, `shortage`, `detention`,
`facility_closed`, `access_restricted`, `weather`, `route_restriction`.

**Connector interface.** Two directions, both abstract in Phase 1:

```text
inbound:  RoadConnector.receive(message) → CanonicalRoadEvent
outbound: RoadConnector.send(command)    → DELIVERY_DISABLED   # Phase 1: always refuses
```

The outbound path exists as a type and refuses at runtime, so Phase 2/3 has a seam and Phase 1 has
no external write. A test asserts every outbound call refuses.

**Fixture format.** Canonical FreightOS JSON, one file per scenario, under
`packages/mode-road/fixtures/`, each with an `expected` block. **No X12 syntax** (Decision E).
Minimum scenarios: single-stop dry van, multi-stop, drop-and-hook, reefer with temperature range,
detention at delivery, seal exception, load rejected at pickup, equipment mismatch.

**Versioning.** Adapter `version` is semver. The extension schema is versioned independently, and
`transport_legs.modal_extension_schema` pins the exact version a row was written against, so a
schema change never silently reinterprets stored data.

**Capability negotiation.** A connector declares supported message kinds and fields; the adapter
intersects them with what the canonical model needs and reports the gap. Unsupported = the feature
is unavailable, never silently defaulted.

**Failure behavior.** Parse failure → the message is stored raw with `parse_status = failed` and an
exception is opened; it is never dropped. Validation failure → rejected with the failing field
paths. Connector unavailable → the operation fails; **no fallback path invents data.**

**Separation of the three layers.**

| Layer                                                                                                             | Phase 1 status                  | Location                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------- |
| Open internal contracts — canonical road model, extension schema, adapter manifest, connector interface, fixtures | **Built**                       | `packages/mode-road/`       |
| Licensed X12 mappings — 204/990/214/210 segment maps, code lists, partner guides                                  | **Deferred, licensing-blocked** | Nothing in repo             |
| Non-X12 ingestion — canonical JSON API, webhook, CSV, document reference                                          | **Built; the reference path**   | `packages/mode-road/` + API |

---

### Specification 8 — RigReceipts boundary

Versioned contract proposal. **Every business formula is marked externally supplied and unresolved,
because no authoritative RigReceipts artifact exists in this repository** (Decision B).

**Contract version.** `rigreceipts.contract/v1`. Transport-agnostic; the Phase 1 binding is the
in-process simulator.

**Required FreightOS inputs.** Tenant reference, carrier profile reference, equipment class,
domicile/terminal reference, an as-of timestamp, and — per request — the load opportunity's route
facts (loaded miles, empty miles, total miles, stop count), commercial facts (linehaul, fuel
surcharge, accessorials, currency, rate basis), timing (pickup and delivery windows), and the cost
profile reference.

**Required RigReceipts outputs.** Break-even per mile, break-even total, target rate per mile,
target total, loaded-mile economics, all-mile economics, margin, and a decision hint — each with
`formula_version`, `formula_source`, `rounding_mode`, `currency`, `computed_at`, and
`input_freshness`.

**Cost-profile inputs.** Fixed costs per period, variable costs per mile, driver compensation
basis, fuel basis, maintenance reserve, insurance, overhead allocation, and an `effective_from` /
`effective_to` window. Class: `TENANT_ECONOMICS` — **prohibited from development copies and from
model providers** (`docs/governance/DATA_CLASSIFICATION.md`).

**Break-even, target-rate, loaded-mile, and all-mile calculations.**

> `STATUS: EXTERNALLY_SUPPLIED / UNRESOLVED.`
> FreightOS defines the _contract shape_ — the inputs required, the outputs returned, and the
> metadata every output carries. It does **not** define the arithmetic. No formula is authored,
> inferred, or approximated in Phase 1. The simulator returns fixture values whose
> `formula_source` is `"simulation"` and whose `provenance.authoritative` is `false`.
> Supplying the authoritative methodology is an owner deliverable (§16, OQ-2).

**Formula version.** Mandatory, non-null, on every response and persisted with every stored
result. A stored profitability result records the exact `formula_version` that produced it, so a
recalculation under a new version is visibly a new result, not a correction of the old one.

**Rounding.** Mandatory and explicit. Recommendation for FreightOS-side arithmetic: integer minor
units throughout, banker's rounding (half-to-even) at the single final presentation step, never
intermediate. `07_…:65` requires recording inputs, formula version, currency, rounding, output,
timestamp, and actor. The _RigReceipts-side_ rounding mode is whatever RigReceipts declares — the
contract carries the field so a mismatch is visible rather than silent.

**Currency.** ISO 4217 alpha-3, mandatory on every monetary value. No implicit USD. Mixed-currency
arithmetic is refused, not converted — there is no FX source in scope.

**Freshness.** Every input carries `observed_at`; every response carries `input_freshness` naming
the oldest input. A configurable staleness threshold marks a result `STALE`. `14_…:65` establishes
the principle for readiness data, and the same reasoning applies to economics: **a stale
profitability number must never silently authorize anything.**

**Provenance.** Mandatory, non-null:
`{ source: "rigreceipts" | "simulation", authoritative: boolean, contract_version, formula_version,
formula_source, computed_at, request_id }`. A consumer that ignores `authoritative` is a defect.

**Errors.** Typed and exhaustive: `INVALID_INPUT`, `COST_PROFILE_NOT_FOUND`,
`COST_PROFILE_EXPIRED`, `FORMULA_VERSION_UNSUPPORTED`, `CURRENCY_MISMATCH`, `STALE_INPUT`,
`UPSTREAM_UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED`, `CONTRACT_VERSION_UNSUPPORTED`. Every error
carries a machine code, a human message, and the failing field paths.

**Timeouts.** A per-request deadline is mandatory. Deadline exceeded → `TIMEOUT` → degraded mode.
There is no unbounded wait and no silent retry that changes the result.

**Degraded mode.** On `UPSTREAM_UNAVAILABLE` or `TIMEOUT`, FreightOS returns **no economics** and
marks the opportunity `economics_unavailable`. It does **not** substitute a cached value, an
estimate, or a default. Constitution Art. IV.6: provider outages cannot corrupt freight state.

**Replay.** Every request/response pair is persisted with its `request_id`, inputs hash, contract
version, and formula version, so any historical result can be re-derived and any recalculation can
be diffed. This is the mechanism that makes `14_…:5` "historical replay" possible later.

**Synthetic fixtures.** Under `packages/rigreceipts-contract/fixtures/`: nominal profitable load,
nominal unprofitable load, break-even edge, missing cost profile, expired cost profile, currency
mismatch, stale input, upstream timeout, upstream unavailable, unsupported formula version.
Each fixture is deterministic and carries `authoritative: false`.

---

### Specification 9 — RIGDESK boundary

Versioned contract proposal. **Contract and simulation only** (Decision C).

**Contract version.** `rigdesk.contract/v1`. In-process simulator in Phase 1.

**Equipment identity.** The correlation problem stated plainly: FreightOS `PoweredUnit` /
`NonpoweredEquipment` ids are FreightOS-owned; RIGDESK equipment ids are RIGDESK-owned. The
contract carries both plus an `identity_confidence`. **An unmatched identity is an error, not a
guess** — an unresolvable equipment reference returns `EQUIPMENT_NOT_FOUND`, never a fuzzy match.

**Maintenance restriction.** `{ equipment_ref, restriction_type, severity, effective_from,
effective_to?, authoritative_source, observed_at, external_reference, evidence? }`. This is the
payload that populates Specification 2's `MaintenanceRestriction`.

**Out-of-service status.** `{ equipment_ref, out_of_service: boolean, since, reason_code,
authoritative_source, observed_at }`. RIGDESK is authoritative (`19_…:187`). FreightOS mirrors and
never overrides.

**Maintenance due status.** `{ equipment_ref, due_kind, due_at | due_at_odometer, confidence,
authoritative_source, observed_at }`. FreightOS **surfaces** this. It does not decide that
maintenance is due, and a due status alone never changes equipment availability.

**Fault or diagnostic reference.** `{ equipment_ref, fault_reference, severity_reported,
reported_at, authoritative_source }` — an opaque **reference only**. FreightOS does not interpret
diagnostic codes, does not map them to actions, and does not infer severity.

**Maintenance appointment reference.** `{ equipment_ref, appointment_reference, scheduled_window,
facility_reference, status, authoritative_source }` — read-only mirror. **FreightOS does not create
or modify it.**

**Roadside-request reference.** `{ equipment_ref, request_reference, status, opened_at,
authoritative_source }` — read-only mirror. **FreightOS does not open one in Phase 1.**

**Freshness.** `observed_at` mandatory on every payload. A restriction older than its configured
freshness window is `STALE`. **Fail-closed asymmetry restated:** a stale or non-authoritative
record may keep a unit unavailable but may never make it available.

**Provenance.** `{ source: "rigdesk" | "simulation", authoritative: boolean, contract_version,
observed_at, request_id }`.

**Health.** A `health()` probe returning `{ status: up|degraded|down, checked_at,
contract_version }`, registered as an integration health check (`11_…:15`) once the integration is
real.

**Errors.** `INVALID_INPUT`, `EQUIPMENT_NOT_FOUND`, `IDENTITY_AMBIGUOUS`, `STALE_DATA`,
`UPSTREAM_UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED`, `CONTRACT_VERSION_UNSUPPORTED`.

**Degraded mode.** On unavailability FreightOS retains the last known restriction **and marks it
stale**. Under the fail-closed asymmetry, a stale `out_of_service` keeps the unit unavailable; a
stale "no restriction" does **not** make the unit active, because Decision C makes unknown
maintenance state yield not-active.

**Simulation fixtures.** Under `packages/rigdesk-contract/fixtures/`: no restriction, active
out-of-service, expiring restriction, maintenance due soon, fault reference present, scheduled
maintenance appointment, open roadside request, unknown equipment, ambiguous identity, stale data,
upstream down.

**Authority statement, verbatim for the contract's front matter.**

> FreightOS may consume maintenance restrictions and surface recommendations. FreightOS may not
> autonomously control, diagnose, approve, or schedule maintenance in Phase 1. RIGDESK owns
> maintenance work orders and return-to-service evidence (`19_…:187`). No agent may release a
> maintenance hold (`02_…:86`).

---

### Specification 10 — Phase 1 test strategy

Required families, with recommended quantitative exit thresholds. `docs/governance/RISK_REGISTER.md:21`
(R-12) records that the handoff sets no thresholds anywhere — `14_…:36` defers every one of them to
the implementer. **The numbers below are recommendations requiring owner adoption**, not facts
derived from the handoff.

| #   | Family                           | Minimum required cases                                                                                                                                                                                | Recommended threshold                                                     |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | **RLS**                          | Every tenant-owned table: read isolation, write rejection, update rejection, delete privilege, NULL-context fail-closed, `FORCE` on owner                                                             | **100% of tenant-owned tables**, no exceptions. Extends `rls.test.ts:192` |
| 2   | **Cross-tenant isolation**       | Negative test per aggregate: tenant B cannot read, write, update, or reference tenant A's rows by primary key                                                                                         | **100% of aggregates**; zero cross-tenant reads observed                  |
| 3   | **Legal-authority boundaries**   | Every permitted and every impermissible `(class, context)` pairing; brokerage refused; `carrier_agent` without appointment refused; context-capability matrix per Decision A                          | **Full 3×6 cross-product**, all 18 combinations asserted                  |
| 4   | **Organization inheritance**     | Inheritance down N levels; child tightening allowed; child weakening refused for each of the six protected categories; source attribution on every effective value                                    | ≥ 4 hierarchy depths; **all 6 protected categories**                      |
| 5   | **Migration apply/down/reapply** | Every migration up, down, re-apply, functional after re-apply; checksum drift detected; partial revert to a chosen version                                                                            | **100% of migrations**, extends `migrations.test.ts:57-138`               |
| 6   | **State-transition enforcement** | Every allowed transition succeeds; every prohibited transition returns `422` and is audited; terminal states refuse all exits                                                                         | **100% of transitions in all 13 machines**, both directions               |
| 7   | **Deterministic money**          | Same inputs → identical output across 1,000 runs; integer minor units only; no float in any money path                                                                                                | **Zero** floating-point types in money code paths (static check)          |
| 8   | **Rounding**                     | Half-to-even at boundaries; no intermediate rounding; documented mode on every stored result                                                                                                          | Property test, **≥ 10,000 generated cases**                               |
| 9   | **Formula versioning**           | Result carries the version that produced it; a version change produces a new result, not a mutation; unsupported version is refused                                                                   | **100% of stored calculation results** carry a non-null version           |
| 10  | **Event/outbox**                 | Event written in the same transaction; rollback loses the event; `event_id` unique; envelope immutable after write; every envelope validates against `event-envelope.schema.json`                     | **100% of emitted event types** schema-validated in CI                    |
| 11  | **Idempotency**                  | Replay with same key + same params → original result, no second event; same key + different params → `409`                                                                                            | **100% of transition commands**                                           |
| 12  | **Append-only audit**            | `UPDATE`, `DELETE`, `TRUNCATE` rejected on `audit_events`, `custody_events`, `load_unload_events`, `goods_receipts`, and the outbox — for both the app role and the owner                             | **100% of append-only tables × 3 operations × 2 roles**                   |
| 13  | **Facility detention timing**    | Clock start/stop derivation; pause intervals; DST boundary; midnight crossing; missing free-time rule → cannot start; facility time zone applied                                                      | **≥ 12 timing cases** including 2 DST transitions                         |
| 14  | **Adapter conformance**          | Every road fixture round-trips; capability negotiation reports gaps; outbound `send` always refuses; parse failure opens an exception and loses nothing                                               | **100% of fixtures**; **8 minimum scenarios** from Spec 7                 |
| 15  | **External contract simulation** | Every RigReceipts and RIGDESK fixture; every error type; timeout; degraded mode; provenance non-null; `authoritative: false` on all simulated output                                                  | **100% of declared error types** for both contracts                       |
| 16  | **Deferred-module enforcement**  | Extends the six existing negative tests: prohibited directory, renamed equivalent, enabled billing, raised horizon, promoted module, flipped flag — **plus** the new facility allow-list check (R-09) | **All 9 conditions** from `21_…:189-199`                                  |
| 17  | **Billing-disabled**             | `BILLING_DISABLED=PASS`; no `meter_events` row after the full suite; no billing account, entitlement, or invoice table exists                                                                         | **Zero** metering rows produced by Phase 1                                |
| 18  | **Autonomy ceiling**             | Every agent resolves ≤ A3; deferred-module agents resolve A0; monotonicity over the full input cross-product; **plus a new Phase 1 assertion that no execution path exceeds A2**                      | **100% of registry entries**; A2 assertion for Phase 1 handlers           |
| 19  | **Handoff preservation**         | 90/90 checksums; `FILES=91`; provenance PASS; overrides unchanged unless a new ADR is cited                                                                                                           | **Zero** unreviewed drift                                                 |

**Cross-cutting recommended thresholds** (all require owner adoption, R-12):

- **Line coverage** ≥ 85% overall; ≥ 95% on money, state-transition, RLS-predicate, and
  legal-context code.
- **Branch coverage** ≥ 80% overall; **100% on every fail-closed branch** — a fail-closed path that
  is never exercised is not a control.
- **Mutation testing** on the money and state-transition modules, ≥ 75% mutation score. Rationale:
  line coverage does not prove a rounding rule is correct.
- **Zero** flaky tests: the suite must pass 5 consecutive runs (Phase 0 evidenced 4).
- **Integration-suite wall time** ≤ 10 minutes, so CI stays a gate rather than a delay.
- **Zero** `any`, `@ts-expect-error`, or `eslint-disable` in money, RLS, or legal-context code
  without an inline justification comment.

**Deliberately not set in Phase 1:** agent accuracy, unsupported-assertion rate, tool-selection
accuracy, escalation rate, model latency, and model cost. `14_…:34-36` requires these to be
evidence-based, and Phase 1 runs no agent. They are Phase 2 owner deliverables.

---

## 7. Proposed data model

Consolidated table inventory, grouped by PR. **62 tables.** Every one carries the
common-field contract (`adr/0017:48-57` + Ruling F), `ENABLE` + `FORCE ROW LEVEL SECURITY`, a
tenant-isolation policy with `USING` and `WITH CHECK`, and explicit `GRANT`/`REVOKE`.

**PR 2 — Identity and organization (12).** `organization_nodes`, `organization_node_closure`,
`legal_entities`, `operating_authorities`, `carrier_appointments`, `users`, `memberships`, `roles`,
`permissions`, `role_permissions`, `service_accounts`, `policy_bindings`.

**PR 3 — Parties and locations (9).** `parties`, `party_roles`, `party_external_identifiers`,
`party_duplicate_candidates`, `locations`, `location_external_identifiers`, `operating_hours`,
`location_restrictions`, `contacts`.

**PR 4 — Carrier and fleet (10).** `carrier_profiles`, `drivers`, `powered_units`,
`nonpowered_equipment`, `equipment_capabilities`, `equipment_capability_assignments`,
`availability_windows`, `maintenance_restrictions`, `assignments`,
`active_powered_unit_observations`.

**PR 5 — Freight core (11).** `shipments`, `consignments`, `cargo_items`, `handling_units`,
`handling_unit_contents`, `transport_journeys`, `transport_legs`, `stops`, `milestones`,
`documents`, `exceptions`.

**PR 6 — State machines and events.** No new tables. Adds transition-guard functions, state enums,
event-type registry, and the `admin` schema from Ruling D.

**PR 7 — Facility primitives (13).** `facilities`, `facility_operational_locations`,
`facility_restrictions`, `appointments`, `cargo_readiness`, `vehicle_visits`,
`load_unload_events`, `seals`, `custody_events`, `detention_clocks`, `free_time_rules`,
`goods_receipts`, `delivery_discrepancies`.

**PR 8 — Road adapter (2).** `road_route_facts`, `road_commercial_facts`. The road extension lives
in `transport_legs.modal_extension`.

**PR 9 — External boundaries (3).** `cost_profiles`, `profitability_results`,
`external_contract_invocations` (the replay log for both RigReceipts and RIGDESK).

**PR 10 — Load opportunity (2).** `load_opportunities`, `load_opportunity_normalized_facts`.

**Append-only tables** (trigger-rejected `UPDATE`/`DELETE`/`TRUNCATE`, privileges revoked, no
`updated_at`, no `version` — following `adr/0017:59-60`): `milestones`, `custody_events`,
`load_unload_events`, `goods_receipts`, `active_powered_unit_observations`,
`external_contract_invocations`, `profitability_results`.

**Control-plane grants** (Ruling D — everything not listed gets **none**): `permissions` (catalog
read) and the `admin.*` functions.

**Data classification additions** required in `docs/governance/DATA_CLASSIFICATION.md`:
`drivers`, `contacts` → `PERSONAL`; `cost_profiles`, `profitability_results`,
`road_commercial_facts` → `TENANT_ECONOMICS`; `custody_events`, `goods_receipts`,
`load_unload_events` → `AUDIT`; everything else tenant-owned → `TENANT_CONFIDENTIAL`.

---

## 8. Proposed state-transition matrices

Delivered in full in Specification 5. Summary of the thirteen machines and their Phase 1 posture:

| #   | Machine              | States         | Phase 1 posture                                                                                       |
| --- | -------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Load Opportunity     | 9 + 5 terminal | Partial — through `ELIGIBLE`; `SCORED`+ refused                                                       |
| 2   | Shipment             | 15 + cancelled | Partial — through `ASSIGNED` as records; execution states observation-only; `INVOICED`/`PAID` refused |
| 3   | Consignment          | 5 + 4 alt      | Full                                                                                                  |
| 4   | Transport Journey    | 3 + 2 alt      | Full                                                                                                  |
| 5   | Transport Leg        | 8 + 2 alt      | Full                                                                                                  |
| 6   | Assignment           | 4 + 2 alt      | Full — record only, no dispatch                                                                       |
| 7   | Appointment          | 13 + 6 alt     | Full                                                                                                  |
| 8   | Vehicle Visit        | 9 + 2 alt      | Full                                                                                                  |
| 9   | Cargo Readiness      | 8 + 6 alt      | Full                                                                                                  |
| 10  | Custody              | 7 + 7 alt      | Full — projection over append-only events                                                             |
| 11  | Detention            | 7 + 1          | Full — **newly specified**, no handoff source                                                         |
| 12  | Delivery Discrepancy | 4 + 2 alt      | Full — `ESCALATED_TO_CLAIM` terminal                                                                  |
| 13  | Exception            | 4 + 2 alt      | Full                                                                                                  |

Every matrix specifies, per transition: current state, target state, authorized actor, required
context, required evidence, approval requirement, emitted event, idempotency behavior, and
invalid-transition response. The universal rules in Specification 5 apply to all thirteen.

**Machine 11 (Detention) has no source in the handoff and is entirely proposed here.** It is the
single largest specification gap in the facility primitives and requires the most owner attention,
because free-time allowance is contractual (§16, OQ-4).

---

## 9. Proposed RLS and authority model

### 9.1 Base predicate

Every tenant-owned Phase 1 table, copying `0002_tenants.up.sql:45-50`:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE  ROW LEVEL SECURITY;
CREATE POLICY <t>_isolation ON <t>
  USING      (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
```

`tenants` itself is the one variation: its policy compares `id`, not `tenant_id`, because the
tenant row **is** the tenant (`0002_tenants.up.sql:48-50`, `0002_tenants.up.sql:19`). Every other
tenant-owned table uses the predicate above verbatim.

`app.current_tenant_id()` returns `NULL` when unset, and `tenant_id = NULL` is `NULL`, never true —
that is the fail-closed mechanism (`0001_platform_foundation.up.sql:91-95`).
`app.is_control_plane()` is role membership, not a session variable (`0001:121-128`), and
`rls.test.ts:147` proves a tenant session cannot claim it.

### 9.2 Additional predicates

| Table group                                | Additional `USING` clause                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memberships`, `users`, `service_accounts` | `AND` the subject node is at or below a node the caller administers                                                                                   |
| Freight core under `shipper_owned`         | `AND EXISTS (party_roles where the caller's legal entity is a party on the shipment)`                                                                 |
| Facility tables under `facility_operator`  | `AND EXISTS (the caller's legal entity operates the facility)`                                                                                        |
| `cost_profiles`, `profitability_results`   | `AND` the caller holds an economics permission. `TENANT_ECONOMICS` is the one class Art. III.2 names, so it gets a second gate above tenant isolation |
| `kill_switches`                            | Already policy-specific — `0004:95-119`                                                                                                               |

### 9.3 Operating-context capability matrix (Decision A)

Enforced in three places, all of which must agree:

1. **Application** — a `contextCapabilities(class, context)` function in `packages/context`
   returning the permitted resource/action set. Called before any command handler runs.
2. **Database** — the RLS predicates in 9.2, plus a `CHECK` on
   `app.is_permitted_legal_pairing(...)` on every table carrying the pair (the function already
   exists at `0001:43-55`).
3. **Envelope** — `schemas/event-envelope.schema.json` `allOf` already enforces both the pairing
   and the `legalentityid` conditional.

| Resource group               | `software_only`/`system` | `software_only`/`shipper_owned`     | `software_only`/`facility_operator` | `software_only`/`autonomous_mobility` | `carrier_agent`/`carrier` | `brokerage`/`brokerage` |
| ---------------------------- | ------------------------ | ----------------------------------- | ----------------------------------- | ------------------------------------- | ------------------------- | ----------------------- |
| Identity and organization    | R/W                      | R (own)                             | R (own)                             | —                                     | R                         | **DENIED**              |
| Parties and locations        | R                        | R/W (own)                           | R/W (own facilities)                | —                                     | R/W                       | **DENIED**              |
| Carrier and fleet            | R                        | —                                   | —                                   | —                                     | R/W                       | **DENIED**              |
| Cost profiles, profitability | —                        | —                                   | —                                   | —                                     | R/W                       | **DENIED**              |
| Freight core                 | R                        | R + limited W                       | R (in-scope shipments)              | —                                     | R/W                       | **DENIED**              |
| Facility primitives          | R                        | R + readiness/appointment-request W | R/W                                 | —                                     | R + visit-side W          | **DENIED**              |
| Custody events               | R                        | W (release side)                    | W (facility side)                   | —                                     | W (carrier side)          | **DENIED**              |
| Load opportunities           | R                        | —                                   | —                                   | —                                     | R/W                       | **DENIED**              |
| Kill switches                | R/W                      | R                                   | R                                   | R                                     | R + tenant-scope W        | **DENIED**              |
| Audit                        | R (control plane)        | R (own)                             | R (own)                             | —                                     | R (own)                   | **DENIED**              |

`brokerage` is `DENIED` across the board and is refused before it reaches a predicate:
`packages/context/src/legal.ts:129-134` rejects the context, `0001:43-55` rejects the pairing in
the database, and `BROKERAGE_EXECUTION_ENABLED` is a mandatory-false flag. Three independent
refusals, which is the posture R-05 records as mitigated.

### 9.4 Authority model summary

- **Legal authority** governs. **Operating context never widens permission** (ADR-0015 rule 5).
- **`carrier_agent` requires a carrier and an appointment.** Phase 1 makes this provable by adding
  `carrier_appointments` — until now `carrierAppointmentId` was an asserted string with nothing
  behind it (`packages/context/src/legal.ts:121-123`).
- **Permission is checked before policy**, per the command path at `06_…:44-60`.
- **No agent actor may perform a Phase 1 transition.** The A2 ceiling makes this structural.
- **Kill switches are recorded but not enforced at the command point in Phase 1** — Phase 0
  carry-forward item 1 defers enforcement to Phase 3. Phase 1 must not claim kill-switch protection
  it does not have. Recommendation: Phase 1 _reads_ the resolved mode and refuses to start a
  transition when the mode is `suspended` or `read_only`. That is cheap, honest, and strictly
  better than nothing, without pretending to be the Phase 3 enforcement point.

---

## 10. External contract proposals

Full detail in Specifications 8 and 9. Shared properties of both:

| Property                             | RigReceipts                                  | RIGDESK                                              |
| ------------------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| Contract id                          | `rigreceipts.contract/v1`                    | `rigdesk.contract/v1`                                |
| Phase 1 binding                      | In-process simulator                         | In-process simulator                                 |
| Live credential                      | **None**                                     | **None**                                             |
| External write                       | **Prohibited**                               | **Prohibited**                                       |
| Mandatory-false flag                 | `RIGRECEIPTS_LIVE_ENABLED`                   | `RIGDESK_LIVE_ENABLED`                               |
| Data class                           | `TENANT_ECONOMICS`                           | `TENANT_CONFIDENTIAL`                                |
| Model-provider access                | **Prohibited** (`DATA_CLASSIFICATION.md`)    | Minimum necessary, redacted                          |
| Provenance required                  | Yes, non-null                                | Yes, non-null                                        |
| `authoritative` in Phase 1           | Always `false`                               | Always `false`                                       |
| Degraded mode                        | Return nothing; mark `economics_unavailable` | Retain last known, mark stale; fail-closed asymmetry |
| Replay log                           | `external_contract_invocations`              | `external_contract_invocations`                      |
| Business logic authored by FreightOS | **None**                                     | **None**                                             |

Both contracts must be registered in `docs/governance/INTEGRATION_REGISTRY.md` with all sixteen
fields from `11_…:15` **before** any live integration, and must pass the security review
`02_…:41-49` requires. Neither is registered today, and Phase 1 does not register them, because
Phase 1 adds no live integration.

---

## 11. X12 licensing boundary

Per Decision E, restated as an operational boundary.

**In Phase 1, in the repository:**

- Canonical road model, road extension schema, adapter manifest listing X12 sets as _named targets_
- Abstract `EdiInboundMessage` / `EdiOutboundMessage` boundary types
- Translator interface with **no X12 implementation**
- Per-partner map versioning metadata with **zero maps**
- Canonical-JSON synthetic fixtures
- The complete non-X12 ingestion path

**Never in Phase 1, and not until licensing is obtained:**

- Segment, element, or qualifier layouts for 204, 990, 214, 210
- X12 envelope syntax in any fixture
- Code-list values drawn from X12 data elements
- Partner implementation guides, in any form, including paraphrase
- Conformance tests asserting X12 output

**Enforcement recommendation.** Add a CI check that fails on X12 envelope markers appearing in
tracked files — a regex over `^ISA\*`, `^GS\*`, `^ST\*` outside `docs/` prose. It is crude, and it
catches the realistic failure mode: someone pasting a sample transaction into a fixture.

**Nothing in this document reproduces or invents licensed X12 content.** The transaction-set
numbers themselves are already present in the handoff (`05_…:51`, `11_…:53`) and are identifiers,
not content.

**First working path.** Canonical JSON over the REST API. This is what Phase 2 ingestion will
exercise, and it removes licensing from the Phase 1 critical path entirely.

---

## 12. Test strategy and quantitative gates

Delivered in Specification 10. Three points worth restating at the plan level:

1. **The thresholds are recommendations, not derived facts.** R-12 records that the handoff sets
   none. Adopting them is an owner ruling; until then CI cannot fail a build on a quantitative bar,
   and every "N%" above is inert.

2. **Coverage is not the interesting number.** The two that matter are _100% branch coverage on
   fail-closed paths_ and _mutation score on money and state transitions_. A fail-closed branch
   that no test exercises is decoration, and line coverage cannot tell a correct rounding rule from
   an incorrect one.

3. **The Phase 0 evidence bar carries forward.** `17_…:63` rejects "should work", "looks complete",
   "tests passed" without output, and "secure" without controls and findings. Every Phase 1 PR
   reports exact commands, exact counts, and exact exit codes — as PR #2 did.

**Phase 1 exit gate**, in addition to `checklists/PHASE_EXIT_GATE.md`:

- All 19 test families present and passing
- `HANDOFF_VALIDATION=PASS`, `PROVENANCE=PASS`, `SCOPE_VALIDATION=PASS`, `BILLING_DISABLED=PASS`,
  `AUTONOMY_CEILING=PASS`, `SAFETY_BOUNDARY=PASS`
- 90/90 handoff checksums
- Zero metering rows produced
- Every migration up/down/re-apply verified
- Deferred-scope verification per `02_…:99-105`
- Clean tree, exact SHA, reviewed PR

---

## 13. Risk register

New and updated risks for Phase 1. Existing Phase 0 risks R-01…R-15 remain in
`docs/governance/RISK_REGISTER.md` and are not restated except where Phase 1 changes them.

### 13.1 Handoff contradictions still affecting Phase 1

| ID  | Contradiction                                                                                                                                                                                                                                                   | Sources                                                                       | Phase 1 resolution                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| C1  | **`schemas/custody-event.schema.json` still uses the old `authority_mode` enum** with five values. It is a verbatim copy with **no declared override** in `handoff-provenance.json`. Phase 1 custody events cannot carry the ADR-0015 model without changing it | `schemas/custody-event.schema.json` vs `adr/0015`                             | Declare a fourth authorized override citing ADR-0015, exactly as was done for `event-envelope.schema.json`. **Blocks PR 7** |
| C2  | **The common-field contract omits `organization_node_id` and `legal_entity_id`**, which `04_…:29-31` and `07_…:5` mandate on tenant-owned records                                                                                                               | `adr/0017:48-57` vs `04_…`, `07_…`                                            | Ruling F                                                                                                                    |
| C3  | **`config/policy/base_policy.yaml` `required_context` still names `authority_mode`**                                                                                                                                                                            | `POLICY_REGISTRY.md` gap 3                                                    | Phase 2 policy pack adopts the pair; Phase 1 bridges via `fromAuthorityMode()` and does not depend on the policy pack       |
| C4  | **`modal-adapter.schema.json` requires `billing_meters`** while billing is disabled and no meter is defined anywhere                                                                                                                                            | `schemas/modal-adapter.schema.json` vs `HORIZON_1_PRODUCTION_RELEASE_GATE.md` | Empty array. Honest, schema-valid, and states the truth                                                                     |
| C5  | **Load Opportunity states past `ELIGIBLE` require capabilities Phase 1 must not have**                                                                                                                                                                          | `07_…:39` vs `13_…:19`, `PHASE_1_UNIVERSAL_CORE.md:7`                         | Enum carries all values; transitions refuse Phase 2+ targets                                                                |
| C6  | **X12 sets are Horizon 1 scope but are licensed documents**                                                                                                                                                                                                     | `05_…:51`, `11_…:53` vs R-15                                                  | Decision E                                                                                                                  |
| C7  | **`facility-adapter.schema.json` `commands` includes outbound facility commands** (`yard_target.assign`, `dock_target.assign`, `facility_task.create`) that would be live external writes                                                                       | `schemas/facility-adapter.schema.json` vs `21_…:105`, `module_states.yaml:21` | Phase 1 references only. No handler may reference a `commands` value. Asserted in CI                                        |
| C8  | **`meter-event.schema.json` `exclusiveMinimum: 0` blocks negative corrections**                                                                                                                                                                                 | already recorded in `HORIZON_1_PRODUCTION_RELEASE_GATE.md`                    | Not a Phase 1 problem — Phase 1 emits no meter events. Stays open for the billing PR                                        |
| C9  | **`21_…:161-171` allowed package list omits every package Phase 0 created**                                                                                                                                                                                     | `21_…:161-171` vs `packages/`                                                 | Ruling H                                                                                                                    |
| C10 | **Phase 1 autonomy is A0–A2 in two places but the enforced backstop is A3**                                                                                                                                                                                     | `13_…:19`, `PHASE_1_UNIVERSAL_CORE.md:7` vs `adr/0018:44`                     | Stricter reading wins (`02_…:97`): A2 for Phase 1 artifacts; the A3 backstop is unchanged                                   |
| C11 | **`InventoryCommitment` and `CargoReadiness` overlap**, and the former edges toward the WMS replacement `21_…:89` forbids                                                                                                                                       | `07_…:75`, `db/reference/0005:60`                                             | `CargoReadiness` only. `InventoryCommitment` out of scope                                                                   |
| C12 | **Kill switches exist but are not enforced at the command point**                                                                                                                                                                                               | Phase 0 carry-forward item 1                                                  | Phase 1 reads the resolved mode and refuses on `suspended`/`read_only`; full enforcement stays Phase 3                      |

### 13.2 Phase 0 decisions that constrain Phase 1

| Constraint                                       | Source           | Effect                                                                                                                                   |
| ------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Reference DDL is never executed                  | `adr/0017:29-31` | Every Phase 1 table is authored fresh with a tested down migration. `db/reference/0002` and `0005` are design records, not build targets |
| `db/0005` is never applied in any form           | `adr/0017:41-42` | The facility half is re-authored under the new legal model; the AV half stays reference-only                                             |
| Two-dimension legal model                        | `adr/0015`       | Every Phase 1 table carries both columns and the pairing `CHECK`                                                                         |
| Computed autonomy ceilings                       | `adr/0018`       | No Phase 1 configuration can raise autonomy                                                                                              |
| No ORM, reviewed raw SQL                         | `adr/0016`       | 62 tables of hand-written SQL and hand-written query layer                                                                               |
| Handoff immutable                                | `adr/0014:26-29` | Naming drift resolved by decision + glossary, never by editing the handoff                                                               |
| Control plane via policy branch, not `BYPASSRLS` | `0001:63-68`     | Decision D builds on this rather than replacing it                                                                                       |
| Provenance drift detection                       | `adr/0014:32-37` | Any schema override needs a declared ADR citation (see C1)                                                                               |

### 13.3 Missing source-of-truth artifacts

| ID   | Missing artifact                                             | Blocks                                                   | Owner               |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------- | ------------------- |
| M-1  | RigReceipts contract and calculation methodology             | Real economics. Not Phase 1 under Decision B             | Owner               |
| M-2  | RIGDESK maintenance contract                                 | Real maintenance state. Not Phase 1 under Decision C     | Owner               |
| M-3  | X12 licences and implementation guides                       | EDI maps. Not Phase 1 under Decision E                   | Owner               |
| M-4  | Quantitative acceptance thresholds (R-12)                    | Enforceable CI bars                                      | Owner               |
| M-5  | Free-time / detention commercial rules                       | Detention clock start. **Blocks PR 7 behavior**          | Owner               |
| M-6  | Meter definitions                                            | Billing. Not Phase 1                                     | Owner               |
| M-7  | Equipment capability seed vocabulary                         | Full registry. Phase 1 seeds the dry-van FTL subset only | Owner/domain        |
| M-8  | Canonical action/permission vocabulary                       | Permission strings. Phase 1 defines the Phase 1 subset   | Engineering + owner |
| M-9  | Retention periods (`DATA_CLASSIFICATION.md` — "Not yet set") | Retention enforcement. Not Phase 1                       | Owner + counsel     |
| M-10 | Profitability/scoring algorithm (R-08)                       | Phase 2 ranking                                          | Owner               |

### 13.4 Phase 1 risk register

| ID   | Risk                                                                                          | Severity | Probability | Owner           | Mitigation                                                                                                                                        | Blocking?                      | Latest resolution point |
| ---- | --------------------------------------------------------------------------------------------- | -------- | ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------- |
| P-01 | Control-plane pattern set wrong in PR 2 and copied into 62 tables                             | Critical | Medium      | Owner + Eng     | Decision D before PR 2; CI asserts no `BYPASSRLS`, every table has a policy                                                                       | **Yes**                        | Before PR 2             |
| P-02 | `software_only` becomes a permission wildcard                                                 | Critical | Medium      | Owner           | Decision A; 18-pairing cross-product test                                                                                                         | **Yes** for PR 7               | Before PR 2             |
| P-03 | Facility primitives drift into FacilityOS (R-09)                                              | High     | Medium      | Eng             | Facility allow-list check in `validate-scope.mjs`; no outbound command surface (C7); no inventory ledger (C11)                                    | No                             | PR 7                    |
| P-04 | Cross-tenant leakage through a missing policy on a new table                                  | Critical | Low         | Eng             | Extend `rls.test.ts:192` to enumerate every tenant-owned table and fail on any without a policy                                                   | No                             | Every PR                |
| P-05 | `TENANT_ECONOMICS` reaching a model provider or a dev copy                                    | Critical | Low         | Eng             | Second permission gate on economics tables; classification register updated in the same PR; no model gateway in Phase 1                           | No                             | PR 9                    |
| P-06 | Simulated economics mistaken for authoritative                                                | High     | Medium      | Eng             | Non-null `provenance` with `authoritative: false`; consumers must check it; tested                                                                | No                             | PR 9                    |
| P-07 | Active-powered-unit calculation drifts toward billing                                         | High     | Low         | Eng             | No meter/billing/entitlement/invoice table; test asserts zero metering rows; `BILLING_DISABLED=PASS`                                              | No                             | PR 4                    |
| P-08 | Detention clock built on an invented free-time default                                        | High     | **High**    | Owner           | Fail-closed: no rule → clock cannot start. **Do not ship a default**                                                                              | **Yes** for detention behavior | PR 7                    |
| P-09 | Licensed X12 content entering the repository                                                  | High     | Low         | Eng             | Decision E; CI regex on X12 envelope markers                                                                                                      | No                             | PR 8                    |
| P-10 | Migration without a working down path                                                         | High     | Low         | Eng             | Runner rejects a migration lacking a down file (R-13); up/down/re-apply tested                                                                    | No                             | Every migration PR      |
| P-11 | A Phase 1 handler creating an A3 execution path                                               | Critical | Low         | Eng             | A2 assertion in CI; no outbound connector; `send` always refuses                                                                                  | No                             | PR 6, PR 8              |
| P-12 | Brokerage reachable through a Phase 1 code path                                               | Critical | Very low    | Owner + Counsel | Three independent refusals already in place (R-05); Phase 1 adds no fourth surface                                                                | No                             | Every PR                |
| P-13 | Custody schema override (C1) skipped, leaving events unemittable                              | High     | Medium      | Eng             | Declare the override with its ADR citation in PR 7; provenance check fails otherwise                                                              | **Yes** for PR 7               | PR 7                    |
| P-14 | 62 tables of hand-written SQL accumulating inconsistency                                      | Medium   | High        | Eng             | A single canonical table template; a CI check that every tenant-owned table has the full common-field set, `FORCE`, a policy, and explicit grants | No                             | PR 2 sets the template  |
| P-15 | Naming drift re-entering through a later PR                                                   | Medium   | Medium      | Eng             | Specification 4's canonical-name table becomes a glossary entry under `docs/governance/`; review checks it                                        | No                             | PR 5                    |
| P-16 | Hidden Phase 2 dependency — a Phase 1 table shaped for a scoring runtime nobody has specified | Medium   | Medium      | Eng             | Phase 1 stores facts, not scores. `profitability_results` stores a contract response, not a rank                                                  | No                             | PR 9, PR 10             |
| P-17 | Hidden Phase 3 dependency — kill-switch enforcement assumed but absent (C12)                  | Medium   | Medium      | Eng             | Phase 1 states plainly that it reads but does not enforce; no Phase 1 claim of kill-switch protection                                             | No                             | PR 6                    |
| P-18 | Organization hierarchy cycle or unbounded depth degrading inheritance                         | Medium   | Low         | Eng             | Closure table + cycle `CHECK` + depth bound (16), tested                                                                                          | No                             | PR 2                    |
| P-19 | Party/location dedup merging silently and rewriting counterparty history                      | Medium   | Low         | Eng             | Candidates only, never automatic merge                                                                                                            | No                             | PR 3                    |
| P-20 | Effective-dated queries defaulting to implicit `now()`, making calculations irreproducible    | Medium   | Medium      | Eng             | Explicit as-of parameter on every effective-dated read; no implicit default                                                                       | No                             | PR 4                    |

---

## 14. Rollback strategy

**Per PR.** Every Phase 1 PR is independently revertable. Branch from `main`, never commit to
`main` directly (Constitution Art. VIII.1), revert the merge commit to undo.

**Per migration.** Every migration ships `NNNN_name.up.sql` and `NNNN_name.down.sql`. The runner
rejects at load time any migration lacking a down file (`adr/0017:34`, R-13). `pnpm db:down`
unwinds in reverse. Apply → revert → re-apply → functional is tested end to end
(`migrations.test.ts:57-138`).

**Ordering constraint.** Because PRs 2–10 are dependency-ordered, rolling back PR _n_ requires
rolling back PRs _n+1…10_ first. The sequence in §15 is designed so each PR's tables reference only
earlier PRs' tables — no forward references, no circular FKs.

**Non-transactional migrations.** Any migration using `ALTER TYPE … ADD VALUE` must declare
`-- freightos:no-transaction` on its first line (`adr/0017:38-40`). Phase 1 should avoid the
construct entirely by creating each enum complete at first creation.

**Data loss on rollback.** Rolling back a Phase 1 migration drops its tables and their data. In
Phase 1 this is acceptable — there is no production deployment, no customer data, and no external
system holding a reference. **This stops being true the moment Phase 1 data reaches a real tenant**,
and the rollback strategy must be revisited at the Horizon 1 production release gate.

**Configuration rollback.** Root operational copies are regenerable via `pnpm sync:handoff`, and
drift is detected in CI (`adr/0014:32-37`). A new declared override (C1) is reverted by removing the
override entry and re-running the sync.

**No deployed surface.** Phase 1 adds no production worker, no public route, no external connector,
and no credential — same posture as Phase 0. There is nothing deployed to roll back, only schema
and code.

**The handoff cannot be rolled back because it is never touched.** 90/90 checksums verify this on
every CI run.

---

## 15. PR-by-PR implementation sequence

Ten PRs. Dependency-ordered. **This is not a single Phase 1 pull request**, and it should not be:
62 tables, 13 state machines, and two external contracts in one diff is unreviewable, and
Constitution Art. VIII.2 requires reviewed PRs with migrations, tests, observability, and rollback.

Each PR must independently satisfy `checklists/PHASE_EXIT_GATE.md` items that apply to it, and CI
must be green before the next opens.

---

**PR 1 — Phase 1 specifications and owner decisions**

- **Scope.** This document, plus ADR-0019 (Decision A), ADR-0020 (Decision D), the ADR-0017
  amendment (Ruling F), a geospatial ADR (Ruling G), risk-register updates for P-01…P-20 and
  M-1…M-10, and the canonical-name glossary from Specification 4.
- **Dependencies.** None.
- **Migrations.** None.
- **Tests.** Validators only — the handoff must remain byte-identical.
- **Rollback.** Revert the merge; documentation only.
- **Excludes.** All code, all schema.
- **Review gate.** Owner approval of Decisions A–E and Rulings F–H.
- **Owner decision required before starting?** **No** — this PR _is_ the decision request.

---

**PR 2 — Identity and organization foundation**

- **Scope.** Specification 1. 12 tables, RLS policies, the `admin` schema and its first functions,
  the canonical table template, organization closure and cycle prevention, policy inheritance
  resolution. **Plus obligations OQ-19 and OQ-20**: extend `app.kill_switch_scope` with
  `legal_entity` and `operating_context` (reviewed `ALTER TYPE` declaring
  `-- freightos:no-transaction`, extended precedence in SQL and TypeScript, Phase 0 records
  resolving identically); add `purpose` and `outcome` to `audit_events` **before** any `admin.*`
  function ships; add `purpose` to the event envelope as a declared override with its
  `handoff-provenance.json` entry. Also the ADR-0021 Phase 0 alignment — `version` →
  `record_version`, `updated_by` on `tenants`.
- **Dependencies.** PR 1 merged; **Decisions A and D ruled**; Rulings F and H ruled.
- **Migrations.** `0005_identity_and_organization.{up,down}.sql`, possibly split by aggregate.
- **Tests.** Families 1, 2, 3, 4, 5, 10, 12, 19. Plus: hierarchy cycle rejected, depth bound
  enforced, child cannot weaken a protected control, control-plane function emits audit, no role
  holds `BYPASSRLS`, tenant cannot `SET ROLE` into the control plane, every `SECURITY DEFINER`
  function pins `search_path`. **OQ-19/OQ-20 tests:** new kill-switch scopes resolvable,
  most-restrictive-wins across old and new scopes, **Phase 0 kill-switch records resolve
  identically**, privileged call missing actor fails closed, missing purpose fails closed, purpose
  outside the vocabulary rejected, envelope without `purpose` fails schema validation,
  `PROVENANCE=PASS` with four declared overrides.
- **Rollback.** Down migration drops all 12 tables; nothing references them yet.
- **Excludes.** Freight, carrier, facility, adapters, external contracts. No authentication or
  session management — that is an application concern, not a Phase 1 domain concern.
- **Review gate.** Architecture review — `02_…:34` requires it for tenant hierarchy changes and
  `02_…:39` for a new authority source. Security review — `02_…:46` requires it for a new
  privileged role.
- **Owner decision required before starting?** **Yes — A and D.**

---

**PR 3 — Parties and locations**

- **Scope.** Specification 3. 9 tables, dedup candidate detection, classification-register update.
- **Dependencies.** PR 2.
- **Migrations.** `0006_parties_and_locations.{up,down}.sql`.
- **Tests.** Families 1, 2, 5, 10, 12. Plus: address normalization idempotent, coordinate bounds
  enforced, restriction without provenance rejected, dedup produces candidates and never merges,
  time zone mandatory where hours exist.
- **Rollback.** Down migration; only PR 2 tables referenced.
- **Excludes.** Facilities beyond the `location_type` value (PR 7), geocoding, PostGIS, any shared
  cross-tenant registry.
- **Review gate.** Standard, plus a privacy review for the `PERSONAL` contact data.
- **Owner decision required before starting?** No — Ruling G should be confirmed, but the
  recommendation is safe to proceed on.

---

**PR 4 — Carrier and fleet registries**

- **Scope.** Specification 2. 10 tables, capability registry with the dry-van FTL seed, effective
  dating, active-powered-unit observation.
- **Dependencies.** PRs 2, 3.
- **Migrations.** `0007_carrier_and_fleet.{up,down}.sql`.
- **Tests.** Families 1, 2, 5, 6 (Assignment), 10, 11, 12. Plus: overlapping availability windows
  rejected, non-authoritative restriction cannot make a unit available, unknown maintenance state
  yields not-active, active-powered-unit count deterministic across runs, **zero metering rows
  produced**, effective-dated read requires an explicit as-of.
- **Rollback.** Down migration.
- **Excludes.** Dispatch, assignment notification, HOS, telematics, any meter or billing artifact.
- **Review gate.** Standard, plus explicit confirmation that the active-powered-unit work created
  no billing surface.
- **Owner decision required before starting?** **Yes — C**, because `MaintenanceRestriction`'s
  source model depends on it.

---

**PR 5 — Mode-neutral freight core**

- **Scope.** Specification 4. 11 tables, append-only milestones, document references, exceptions.
- **Dependencies.** PRs 2, 3, 4.
- **Migrations.** `0008_freight_core.{up,down}.sql`.
- **Tests.** Families 1, 2, 5, 10, 12. Plus: leg sequence uniqueness, leg contiguity validation,
  a shipment cannot leave `DRAFT` incomplete, modal extension validates against its pinned schema
  version, `00_…:111` review recorded, custody/milestone append-only enforced for both roles.
- **Rollback.** Down migration.
- **Excludes.** State transitions (PR 6), road specifics (PR 8), facility links (PR 7), load
  opportunities (PR 10).
- **Review gate.** **Architecture review** — `02_…:33` requires it for core schema changes. This is
  the most consequential schema PR in Phase 1.
- **Owner decision required before starting?** No.

---

**PR 6 — State machines and event contracts**

- **Scope.** Specification 5 for machines 1–6 and 13, transition guard functions, event-type
  registry, outbox emission helpers, idempotency and version handling, the kill-switch read from
  C12. **Plus obligation OQ-21**: replace `authority_mode` in `schemas/custody-event.schema.json`
  with `legal_authority_class` + `operating_context`, mirroring the envelope's ADR-0015 rule-6
  pairing constraint; version the contract as a breaking change; declare the override in
  `handoff-provenance.json` citing ADR-0015 and ADR-0019. No stored event is mutated.
- **Dependencies.** PRs 2, 4, 5. **Must land before PR 7**, which creates `custody_events`.
- **Migrations.** `0009_state_machines.{up,down}.sql` — enums, guard functions, no new tables.
- **Tests.** Families 6, 10, 11, 12, 18. Plus: every prohibited transition returns `422` and is
  audited, terminal states refuse all exits, no agent actor may transition, every emitted event
  validates against the envelope schema, replay emits no second event, `suspended` kill-switch mode
  refuses a transition. **OQ-21 negative tests:** a custody event carrying `authority_mode` is
  rejected, an impermissible class/context pairing is rejected, a missing `legal_entity_id` outside
  system scope is rejected, an empty evidence array is rejected.
- **Rollback.** Down migration drops enums and functions.
- **Excludes.** Facility machines (PR 7), policy engine, approval workflow, any A3 path.
- **Review gate.** Architecture review — `02_…:36` requires it for event-envelope changes; this PR
  fixes the event-type registry shape.
- **Owner decision required before starting?** No.

---

**PR 7 — Minimum facility primitives**

- **Scope.** Specification 6, plus Specification 5 machines 7–12. 13 tables, the custody schema
  override (C1), the facility allow-list validator check (R-09/P-03).
- **Dependencies.** PRs 2, 3, 4, 5, 6. **OQ-21 must have landed in PR 6** — `custody_events` is created here and cannot be written against a schema that contradicts ADR-0015.
- **Migrations.** `0010_facility_primitives.{up,down}.sql`.
- **Tests.** Families 1, 2, 3, 6, 10, 11, 12, 13, 16. Plus: appointment capacity conflict rejected,
  reschedule preserves the original window, hold cannot be released by an agent, load/unload
  ordering enforced, seal mismatch produces a custody exception, custody requires ≥1 evidence item,
  communication alone insufficient for acceptance, detention cannot start without a free-time rule,
  DST and midnight-crossing detention cases, no outbound facility command referenced anywhere.
- **Rollback.** Down migration; the custody schema override is reverted by removing its provenance
  entry.
- **Excludes.** Standalone FacilityOS, inventory ledger, labor management, WMS/YMS/WES, robotics,
  facility connectors, outbound commands, `InventoryCommitment`.
- **Review gate.** **Owner review of the FacilityOS boundary specifically**, plus security review
  for the new context capabilities.
- **Owner decision required before starting?** **Yes — A**, and the free-time rules deliverable
  (M-5) is required for detention to be more than a mechanism.

---

**PR 8 — Road FTL adapter and fixtures**

- **Scope.** Specification 7. `packages/modal-core/` and `packages/mode-road/`, adapter manifest,
  extension schema, equipment matching, stops, route and commercial facts, connector interface,
  8+ canonical fixtures, the X12 marker CI check.
- **Dependencies.** PRs 4, 5, 6.
- **Migrations.** `0011_road_adapter.{up,down}.sql` — 2 tables.
- **Tests.** Families 6, 10, 14. Plus: every fixture round-trips, capability negotiation reports
  gaps, **outbound `send` always refuses**, parse failure opens an exception and loses nothing,
  extension schema version pinned per row, no X12 syntax anywhere.
- **Rollback.** Down migration plus package removal.
- **Excludes.** X12 maps, X12 fixtures, X12 code lists, live connectors, routing computation, rail
  and ocean adapters beyond empty contract stubs.
- **Review gate.** Architecture review — `02_…:35` requires it for adapter contract changes.
- **Owner decision required before starting?** **Yes — E**, to confirm the interfaces-only posture.

---

**PR 9 — RigReceipts and RIGDESK simulation boundaries**

- **Scope.** Specifications 8 and 9. `packages/rigreceipts-contract/`,
  `packages/rigdesk-contract/`, 3 tables, both simulators, both fixture sets, both mandatory-false
  flags, integration-registry and classification-register updates.
- **Dependencies.** PRs 4, 5, 6.
- **Migrations.** `0012_economics_and_maintenance_boundary.{up,down}.sql`.
- **Tests.** Families 1, 2, 7, 8, 9, 15. Plus: no formula authored by FreightOS (a review assertion
  recorded in the PR), `authoritative: false` on every simulated response, degraded mode returns no
  economics, stale RIGDESK data cannot make a unit available, currency mismatch refused, replay
  reproduces a historical result exactly, no live credential and no network call.
- **Rollback.** Down migration plus package removal.
- **Excludes.** Live integration, credentials, invented formulas, scoring, ranking.
- **Review gate.** Security review — `02_…:43` requires it for new external integrations, even
  simulated ones, because the seam is what a live one will occupy.
- **Owner decision required before starting?** **Yes — B and C.**

---

**PR 10 — Load opportunity, read-only surfaces, and final gate evidence**

- **Scope.** Load Opportunity tables and machine 1 (through `ELIGIBLE`), the ingestion boundary,
  normalized commercial facts, read-only REST surfaces with generated OpenAPI, and the Phase 1 exit
  evidence package.
- **Dependencies.** All prior PRs.
- **Migrations.** `0013_load_opportunity.{up,down}.sql` — 2 tables.
- **Tests.** Full suite, all 19 families. Plus: transitions past `ELIGIBLE` refused with
  `NOT_AUTHORIZED_IN_PHASE`, every read surface is tenant-filtered, no write endpoint performs an
  external action, OpenAPI generated and validated.
- **Rollback.** Down migration; the API layer is additive.
- **Excludes.** Scoring, ranking, recommendation, negotiation, dispatch, any write endpoint that
  reaches outside the database, the Dispatch Copilot runtime, agent tools.
- **Review gate.** **Phase 1 exit gate** — `checklists/PHASE_EXIT_GATE.md` plus §12's additions,
  plus deferred-scope verification per `02_…:99-105`.
- **Owner decision required before starting?** No — all decisions resolved by this point.

---

**No PR in this sequence contains Phase 2 AI Dispatch Copilot work.** No agent runtime, no tool
invocation, no scoring, no ranking, no negotiation, no recommendation engine, and no model-gateway
call appears anywhere in PRs 1–10.

---

## 16. Open questions

**Superseded as a live register.** `docs/governance/OPEN_QUESTIONS.md` is now the maintained
open-question register, and it records the post-ruling status of every item below plus OQ-15
through OQ-21. Seven of the fourteen questions here are resolved; OQ-4 is no longer blocking. The
table is retained as the record of what was asked.

| ID    | Question                                                                                                                              | Owner           | Blocks                                                                    | Latest point                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| OQ-1  | Decisions A–E: adopt the recommendations or rule otherwise?                                                                           | Owner           | Decisions A and D block PR 2; C blocks PR 4; E blocks PR 8; B blocks PR 9 | Before PR 2                                   |
| OQ-2  | Will an authoritative RigReceipts methodology be supplied, and when? Without it Phase 1 economics stay non-authoritative indefinitely | Owner           | Real economics (not Phase 1)                                              | Before Phase 2 ranking                        |
| OQ-3  | Will an authoritative RIGDESK contract be supplied?                                                                                   | Owner           | Real maintenance state (not Phase 1)                                      | Before Phase 2                                |
| OQ-4  | **What are the free-time / detention rules?** Contractual, absent from the handoff, and the detention clock cannot start without them | Owner           | Detention _behavior_ in PR 7 (the mechanism ships regardless)             | Before PR 7 merges                            |
| OQ-5  | Adopt the quantitative thresholds in Specification 10, or supply different ones? (R-12)                                               | Owner           | Enforceable CI bars                                                       | Before PR 2, so gates are real from the start |
| OQ-6  | Is X12 licensing to be procured, and on what timeline?                                                                                | Owner           | EDI maps (not Phase 1)                                                    | Before Phase 2 EDI ingestion                  |
| OQ-7  | Ruling F — confirm `organization_node_id` and `legal_entity_id` join the common-field contract?                                       | Owner           | PR 2's table template                                                     | Before PR 2                                   |
| OQ-8  | Ruling G — confirm no PostGIS in Phase 1?                                                                                             | Owner           | PR 3                                                                      | Before PR 3                                   |
| OQ-9  | Ruling H — confirm the package-path reading?                                                                                          | Owner           | PR 8's package layout                                                     | Before PR 8                                   |
| OQ-10 | Should local `main` be fast-forwarded to `origin/main` (§1.4)?                                                                        | Owner           | Nothing; cosmetic                                                         | Any time                                      |
| OQ-11 | Equipment capability seed vocabulary beyond dry-van FTL — who supplies it?                                                            | Owner/domain    | Full registry (not Phase 1)                                               | Before Phase 2                                |
| OQ-12 | Retention periods (`DATA_CLASSIFICATION.md` — "Not yet set")                                                                          | Owner + counsel | Retention enforcement (not Phase 1)                                       | Before Horizon 1 release                      |
| OQ-13 | Does the owner accept 62 tables across 8 schema PRs, or prefer a different split?                                                     | Owner           | The sequence in §15                                                       | Before PR 2                                   |
| OQ-14 | Confirm that Phase 1 reads but does not enforce kill switches (C12), and that this is stated in the exit evidence rather than glossed | Owner           | PR 6 framing                                                              | Before PR 6                                   |

---

## 17. Exact owner approvals required — **all obtained**

**Before any Phase 1 implementation PR opens** — all six obtained 2026-08-04:

1. ✅ **Decision A** — software-only operating-context capability matrix. → `adr/0019`
2. ✅ **Decision D** — PostgreSQL control-plane access model. → `adr/0020`
3. ✅ **Ruling F** — common-field contract extension. → `adr/0021` (amends ADR-0017)
4. ✅ **Ruling H** — package-path clarification. → `adr/0024`
5. ✅ **OQ-5** — quantitative thresholds. → `docs/governance/ACCEPTANCE_THRESHOLDS.md`
6. ✅ **OQ-13** — ten-PR sequence. → `docs/decisions/0002-phase-1-owner-rulings.md` §5

**Before specific PRs** — all obtained:

7. ✅ **Decision C** (PR 4) and **Ruling G** (PR 3). → owner rulings record §2, `adr/0022`
8. ✅ **Decision E** (PR 8). → `adr/0023`
9. ✅ **Decision B** (PR 9). → owner rulings record §2
10. ✅ **OQ-4** — resolved differently than proposed. `adr/0025` makes detention policy-driven with
    no default, so free-time rules **no longer block PR 7**; they bound production detention
    behaviour per tenant instead.

**Remaining approval, not yet given:** authorization to open PR 2. Specification PR 1 is
documentation only and does not carry it.

**Governance approvals required by `02_GOVERNANCE_AND_NON_REGRESSION.md`:**

| Approval                                            | Required by | Applies to                             |
| --------------------------------------------------- | ----------- | -------------------------------------- |
| Owner — material scope change                       | `02_…:24`   | The Phase 1 authorization itself       |
| Architecture review — core schema                   | `02_…:33`   | PR 5                                   |
| Architecture review — tenant hierarchy              | `02_…:34`   | PR 2                                   |
| Architecture review — adapter contract              | `02_…:35`   | PR 8                                   |
| Architecture review — event envelope                | `02_…:36`   | PR 6, and PR 6's custody override (C1) |
| Architecture review — new authority source          | `02_…:39`   | PR 2 (`carrier_appointments`)          |
| Security review — new external integration          | `02_…:43`   | PR 9                                   |
| Security review — new privileged role               | `02_…:46`   | PR 2 (`admin` schema)                  |
| Security review — new cross-tenant admin capability | `02_…:49`   | PR 2 (control-plane functions)         |

**Explicitly not requested, and must not be granted as a side effect:** module-state promotion,
horizon advance, billing activation, brokerage enablement, A3 or A4 autonomy, live external
credentials, or any change to the preserved handoff.

---

## 18. Proposed next implementation prompt

To be issued **only after** the approvals in §17. Verbatim:

> **FreightOS Phase 1 — PR 2: Identity and organization foundation**
>
> Baseline: `main` @ `671b1d097ae166436a464f1a8daaffe8ea060e81`, tag `freightos-phase-0-accepted`.
> Verify the baseline before writing anything: HEAD, `origin/main`, tag object type and target,
> working-tree state, 90/90 handoff checksums, handoff validator, provenance, scope validator,
> autonomy ceiling, billing-disabled, unit tests, integration tests. Stop and report if anything
> differs.
>
> Authority for this work: the owner rulings recorded in
> `docs/plans/phase-1-definition-and-owner-decisions.md` §5 and §17, ADR-0019 (operating-context
> boundaries), ADR-0020 (control-plane access), and the ADR-0017 amendment (common-field contract).
> Implement Specification 1 from that document and nothing else.
>
> Branch from `main`. Implement:
>
> - Migration `0005_identity_and_organization.{up,down}.sql` creating the twelve tables in §7 PR 2,
>   each with the full common-field contract, `ENABLE` + `FORCE ROW LEVEL SECURITY`, a tenant
>   isolation policy with `USING` and `WITH CHECK`, and explicit `GRANT`/`REVOKE`.
> - The organization hierarchy with a closure table, cycle prevention, and a depth bound of 16.
> - Policy inheritance resolution returning, per control, the effective value and its source node,
>   with the six protected categories un-weakenable by a child.
> - `carrier_appointments`, so `carrier_agent` context becomes provable rather than asserted.
> - The `admin` schema per ADR-0020: narrowly scoped `SECURITY DEFINER` functions with pinned
>   `search_path`, `EXECUTE` granted only to `freightos_control_plane`, each emitting an audit row.
> - The operating-context capability matrix per ADR-0019 in `packages/context`.
> - The canonical table template every later Phase 1 migration copies.
>
> Do not implement: freight core, carrier or fleet registries, facility primitives, modal adapters,
> external contracts, load opportunities, authentication, session management, a policy engine, an
> agent runtime, any A3 path, or any external connector. Do not create a meter, billing account,
> entitlement, or invoice artifact. Do not modify `docs/production-handoff/v1.2/`. Do not use
> `BYPASSRLS`. Do not raise any autonomy ceiling — Phase 1 artifacts stay at A2 or below.
>
> Tests required before the PR opens: RLS isolation on all twelve tables including negative cases
> and NULL-context fail-closed; the full 3×6 legal-pairing cross-product; hierarchy cycle and depth
> rejection; child cannot weaken any of the six protected controls; effective policy reports its
> source node; migration up/down/re-apply/functional; every `admin.*` call emits an audit row; no
> role holds `BYPASSRLS`; a tenant session cannot `SET ROLE` into the control plane; every
> `SECURITY DEFINER` function pins `search_path`; handoff still 90/90 and byte-identical.
>
> Report exact commands, exact counts, and exact exit codes. `17_CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md:63`
> rejects "tests passed" without output.
>
> Commit and push to `claude/freightos-phase-1-pr2-identity`. Open a draft pull request. Stop after
> PR 2 and wait for review — do not begin PR 3.

---

## Appendix A — Phase 1 readiness statement

**`PHASE_1_SPECIFICATION_PR_READY_FOR_OWNER_REVIEW`**

The Phase 0 baseline is intact and re-verified. The specifications, decision analyses, data model,
state matrices, RLS model, external contracts, test strategy, sequencing, and risk register are
complete and internally consistent. Decisions A–E, Rulings F–H, the detention mechanism, the
quantitative gates, and the ten-PR sequence are all ruled and recorded in ADRs 0019–0025,
`docs/decisions/0002-phase-1-owner-rulings.md`, `docs/governance/ACCEPTANCE_THRESHOLDS.md`,
`docs/governance/DOMAIN_GLOSSARY.md`, and `docs/governance/OPEN_QUESTIONS.md`.

**Phase 1 implementation is still not authorized.** Specification PR 1 is documentation only. PR 2
requires separate owner authorization, and three implementation obligations the rulings created —
OQ-19 (kill-switch scope enum), OQ-20 (envelope `purpose`, audit `purpose`/`outcome`), OQ-21
(custody schema override) — must land in the PRs named against them.

Three owner deliverables remain outstanding and are **not** blocking, because Rulings B, C, and E
route around them: the RigReceipts methodology (OQ-2), the RIGDESK contract (OQ-3), and X12
licensing (OQ-6). They bound what Phase 1 can truthfully claim, and every artifact that depends on
them says so explicitly — `authoritative: false`, `EXTERNALLY_SUPPLIED`, `implemented: false`.
