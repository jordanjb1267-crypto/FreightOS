# 01 — Package Inventory and Precedence

## 1. Preflight (§0)

Re-run from clean `main` before the audit branch was created.

```text
branch          main
HEAD            d5556b0f96cfb2edc7cd29e214db5f98749df2af
origin/main     d5556b0f96cfb2edc7cd29e214db5f98749df2af
relationship    0 ahead / 0 behind
tree            clean (git status --porcelain -uall empty)
```

| Precondition                                           | Result           |
| ------------------------------------------------------ | ---------------- |
| branch = `main`                                        | PASS             |
| working tree clean                                     | PASS             |
| `HEAD == origin/main`                                  | PASS             |
| merged W0/W1 audit under `docs/workforce-engineering/` | PASS — 12 files  |
| `v1.5.0-enterprise-agent-operations`                   | PASS — 35 files  |
| `facilityos-v1.0.0-enterprise-agent-operations`        | PASS — 39 files  |
| `v1.6.0-brokerage-enterprise-agent-operations`         | PASS — 39 files  |
| `v1.7.0-agentic-logistics-network-coherence`           | PASS — 32 files  |
| `v1.8.0-agent-workforce-engineering-certification`     | PASS — 189 files |

An earlier preflight attempt failed on the clean-tree precondition (38 untracked files of a drafted
v1.9 package). The audit halted and reported rather than repairing state. The owner preserved the
draft on `design/v1.9.0-workforce-operational-design-completion` and restored a clean tree; the
audit then re-ran §0 from the top. See [README.md](README.md) for the independence disclosure.

## 2. Installed production-handoff packages

| Package                                            | Version | Files | Numbered docs | Doc lines | Contracts            | Diagrams |
| -------------------------------------------------- | ------- | ----- | ------------- | --------- | -------------------- | -------- |
| `v1.2`                                             | 1.2     | —     | —             | —         | base handoff         | —        |
| `v1.3.0-security-resilience`                       | 1.3.0   | —     | —             | —         | controlling          | —        |
| `v1.4.0-network-architecture`                      | 1.4.0   | —     | —             | —         | additive-subordinate | —        |
| `v1.5.0-enterprise-agent-operations`               | 1.5.0   | 35    | 19            | 2,415     | 6                    | 3        |
| `facilityos-v1.0.0-enterprise-agent-operations`    | 1.0.0   | 39    | 24            | 1,957     | 5                    | 3        |
| `v1.6.0-brokerage-enterprise-agent-operations`     | 1.6.0   | 39    | 25            | 1,899     | 4                    | 3        |
| `v1.7.0-agentic-logistics-network-coherence`       | 1.7.0   | 32    | 22            | 1,460     | 3                    | 3        |
| `v1.8.0-agent-workforce-engineering-certification` | 1.8.0   | 189   | 13            | **343**   | 5                    | 6        |

`COMBINED_HANDOFF.md` is excluded from the line counts: it is a concatenation that also inlines
contracts, templates and diagrams. v1.8's is 16,872 lines because it inlines 152 job-book files.

**Observation carried forward.** v1.8's normative corpus is 343 lines across 13 documents — 4.3×
smaller than the smallest upstream package it is responsible for decomposing. Individual standards:
`05_EXCEPTION_OWNERSHIP_STANDARD.md` 11 lines, `07_SELLABILITY_AND_CLAIM_STANDARD.md` 15,
`06_JOB_CERTIFICATION_AND_EVALUATION.md` 16, `03_WORK_UNIT_AND_RESPONSIBILITY_MODEL.md` 17,
`08_END_TO_END_WORKFORCE_SIMULATION_STANDARD.md` 17, `11_WORKFORCE_CLASSIFICATION_REPORT.md` 17,
`01_ROLE_DECOMPOSITION_AND_AGENT_MINIMIZATION.md` 19, `04_AGENT_INTERACTION_ATLAS.md` 21,
`02_JOB_BOOK_STANDARD.md` 31.

This is a measurement, not by itself a verdict. The doctrine those 343 lines contain is largely
correct (see [15](15_ARCHITECTURE_COMPLETENESS_SCORECARD.md)). The finding is that a package this
thin cannot carry the conformance load its 76 instances require, and
[14](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md) shows that it does not.

## 3. Declared governance precedence

`governance-layers.json` declares exactly three layers:

| id                            | version | root                                                  | role                     | integrity file    |
| ----------------------------- | ------- | ----------------------------------------------------- | ------------------------ | ----------------- |
| `production-handoff`          | v1.2    | `docs/production-handoff/v1.2`                        | **base**                 | `SHA256SUMS.txt`  |
| `security-privacy-resilience` | v1.3.0  | `docs/production-handoff/v1.3.0-security-resilience`  | **controlling**          | `MANIFEST.sha256` |
| `network-architecture`        | v1.4.0  | `docs/production-handoff/v1.4.0-network-architecture` | **additive-subordinate** | `MANIFEST.sha256` |

Subordination rule, verbatim (`governance-layers.json:3`):

> "Network architecture is ADDITIVE and SUBORDINATE to the production handoff and to the security,
> privacy, tenant-isolation, authority, resilience and non-regression requirements that precede it.
> Where a network requirement and a security requirement conflict, the stricter restriction wins
> and the network requirement yields. No layer below may be weakened to simplify a layer above."

### 3.1 The five newer packages are not declared — GAP

`v1.5.0`, `facilityos-v1.0.0`, `v1.6.0`, `v1.7.0` and `v1.8.0` — **334 files** — appear nowhere in
`governance-layers.json`. Consequences:

- `scripts/check-network-governance.mjs` verifies only declared layers, so nothing verifies their
  integrity. The script's own header states why this matters: a binding document "could be edited —
  a schema loosened, a prohibited-shortcut clause deleted, an acceptance gate softened — and no
  check in this repository would notice."
- They ship `MANIFEST.json` (a JSON object with a `files` array) rather than the `MANIFEST.sha256`
  format the validator parses, so even declaring them would require a validator change.
- `grep` for `v1.5|v1.6|v1.7|v1.8|facilityos-v1` across `scripts/`, `.github/`, `package.json` and
  `turbo.json` returns **zero** matches. CI does not know they exist.
- Their position in the precedence order is undeclared. Each self-declares subordination in prose
  (`v1.7 19_GOVERNANCE_AND_NON_REGRESSION.md:5`: "Existing Constitution, security/resilience,
  legal/safety gates, sequencing doctrine and signed ADRs remain controlling"), but nothing
  machine-readable records it.

Status: **GAP** — a governance-wiring defect, not a design defect inside the packages.
Independently identified by the merged W0/W1 audit as finding W01-F-GOV-01, which specifies the fix
completely (`docs/workforce-engineering/PROPOSED_ADDITIVE_PR_SEQUENCE.md:38`, card AWE-0).

### 3.2 The packages are disconnected from the decision record — the audit's root cause

Two greps, run in both directions:

| direction       | query                                                                                            | result        |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| packages → ADRs | `ADR-?[0-9]{2,4}` / `adr/[0-9]{4}` across all five packages                                      | **0 matches** |
| ADRs → packages | `v1\.5\|v1\.6\|v1\.7\|v1\.8\|facilityos-v1` across `adr/`, `docs/governance/`, `docs/decisions/` | **0 matches** |

Not one of the five packages cites any of the 27 accepted repository ADRs. Not one accepted ADR,
governance document or network decision record cites any of the five packages.

This is the structural fact from which most drift in this audit follows:

| drift found                                                                                                | why nothing caught it                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| two disjoint command vocabularies ([06](06_ACTION_COMMAND_POLICY_VOCABULARY_AUDIT.md))                     | no shared registry either side must conform to |
| v1.7's six "planes" vs ADR-0015's two-dimension model ([07](07_AUTHORITY_LEGAL_AUTONOMY_COHERENCE.md))     | v1.7 never read ADR-0015                       |
| FacilityOS detention vs ADR-0025's detention mechanism ([13](13_MULTIMODAL_AND_RIGDESK_BOUNDARY_AUDIT.md)) | FacilityOS never read ADR-0025                 |
| v1.8's J0–J7 ladder to A5 vs ADR-0018's computed ceiling ([07](07_AUTHORITY_LEGAL_AUTONOMY_COHERENCE.md))  | v1.8 never read ADR-0018                       |
| v1.7 vs v1.8 artifact vocabularies ([09](09_NETWORK_HANDOFF_AND_EVIDENCE_COHERENCE.md))                    | no shared artifact registry                    |

The direction of the gap matters. The repository is not behind the packages — on detention it is
**ahead**. `adr/0025-detention-policy-driven-mechanism.md:10-16` opens by recording that detention
is "named three times in the preserved handoff and defined nowhere… no state machine, no free-time
rule, no clock-start definition, and no rounding rule anywhere in the package," then supplies the
policy-driven mechanism, the required policy-field table and scope precedence. FacilityOS
`11_APPOINTMENTS_CAPACITY_AND_DETENTION.md:40-57` still leaves all of it open.

## 4. Effective precedence order (derived)

No document states this order; it is derived from the strictest-rule principle plus each package's
own subordination language. Recorded here because an implementation team needs it and it does not
currently exist anywhere machine-readable.

```text
1  Constitution + sequencing doctrine (v1.2)          — base, CI-verified
2  Security / privacy / resilience (v1.3.0)           — controlling, CI-verified
3  Accepted ADRs adr/0001-0027                        — accepted owner rulings, enforced in code
4  Accepted network ADRs docs/decisions/0001-0018     — 6 Accepted, 10 still "Proposed" (see below)
5  Network architecture (v1.4.0)                      — additive-subordinate, CI-verified
6  config/scope/module_states.yaml                    — machine-readable scope authority
7  v1.5 / FacilityOS / v1.6                           — domain architecture, undeclared
8  v1.7                                               — coherence layer, undeclared, self-subordinating
9  v1.8                                               — workforce layer, undeclared, self-limiting
10 docs/workforce-engineering/ W0/W1                  — merged audit of layer 9 against layers 1-6
```

Where texts overlap, the strictest accepted rule governs. Two consequences worth stating:

- `v1.8 11_WORKFORCE_CLASSIFICATION_REPORT.md:17` self-limits: "This classification is a design
  recommendation subject to W0/W1 repository decomposition review; the runtime must not create an
  agent solely because this package names one." Layer 10 therefore governs layer 9 on
  classification — by layer 9's own terms.
- `v1.7 19_GOVERNANCE_AND_NON_REGRESSION.md:15-23` lists what v1.7 may **not** do, including
  "activate deferred modules", "weaken legal-plane separation" and "rewrite prior accepted handoffs
  merely for consistency." Where v1.7 §13 appears to restate the legal model differently from
  ADR-0015, ADR-0015 governs.

### 4.1 Ten network ADRs remain "Proposed" while their content ships in SQL — CONFLICT

`docs/decisions/` 0003, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0015, 0016, 0017 carry
Status "Proposed … awaiting external rereview". Only 0012, 0013, 0014 and 0018 are "Accepted". Yet
their content is load-bearing in shipped migrations 0028–0035. Nothing technical is missing; the
missing item is a governance act. Recorded as CONFLICT in
[14](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md).

## 5. Integrity verification (§25 baseline)

All five packages verified by SHA-256 against their own `MANIFEST.json`, before the audit branch
was created and again before commit.

| package                                            | listed | on disk | mismatched | missing | unlisted extras | result    |
| -------------------------------------------------- | ------ | ------- | ---------- | ------- | --------------- | --------- |
| `v1.5.0-enterprise-agent-operations`               | 34     | 35      | 0          | 0       | 0               | **CLEAN** |
| `facilityos-v1.0.0-enterprise-agent-operations`    | 38     | 39      | 0          | 0       | 0               | **CLEAN** |
| `v1.6.0-brokerage-enterprise-agent-operations`     | 38     | 39      | 0          | 0       | 0               | **CLEAN** |
| `v1.7.0-agentic-logistics-network-coherence`       | 31     | 32      | 0          | 0       | 0               | **CLEAN** |
| `v1.8.0-agent-workforce-engineering-certification` | 188    | 189     | 0          | 0       | 0               | **CLEAN** |

`on disk = listed + MANIFEST.json`, which every manifest excludes from its own file list. The check
covers three failure modes: hash mismatch (a listed file was edited), missing file (the package is
incomplete), and unlisted extra (content carried as if bound but not in the manifest). All three
are zero for all five packages.

## 6. Repository reality (the implementation dimension)

Recorded here so that later documents can keep design and implementation strictly separate.

**Scope authority** — `config/scope/module_states.yaml`: `horizon_authorized: 1`,
`stop_after_horizon: 1`. Enforced as a blocking CI step by `scripts/validate-scope.mjs`
(`.github/workflows/ci.yml:100-101`), which fails the build on prohibited paths, deferred-capability
deployable names, deferred-capability credential names, and migrations creating named domain tables.

| state                           | modules                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACTIVE_BUILD` (h1)             | `freightos_shared_core`, `road_ftl_carrier_operations`, `carrier_core`, `carrier_copilot` (`autonomy_max: A3`), `rigreceipts_economics_boundary`, `rigdesk_maintenance_hooks` |
| `FOUNDATION_ONLY` (h1)          | `minimum_facility_primitives`                                                                                                                                                 |
| `PROMOTION_GATED` (≥h2)         | `carrier_autonomous_a4_a5`, `shipper_control_tower`, `facilityos_lite`                                                                                                        |
| `CUSTOMER_GATED` (≥h3)          | `facilityos_full`                                                                                                                                                             |
| `LEGAL_AND_MARKET_GATED` (≥h3)  | `digital_brokerage`                                                                                                                                                           |
| `LIQUIDITY_GATED` (≥h4)         | `freight_exchange`                                                                                                                                                            |
| `INTERFACE_AND_SIMULATION_ONLY` | `autonomous_vehicle_gateway`, `rail_adapter`, `ocean_adapter` (all ≥h3)                                                                                                       |
| `PARTNER_AND_SAFETY_GATED`      | `live_autonomous_vehicle_missions`                                                                                                                                            |
| `DORMANT` (≥h4)                 | `air_adapter`                                                                                                                                                                 |

All eight `mandatory_defaults` are `false`, including `BROKERAGE_EXECUTION_ENABLED`,
`FACILITYOS_STANDALONE_ENABLED` and `AUTONOMOUS_DISPATCH_A4_ENABLED`.

**Of the five participant planes v1.8 staffs, exactly one — carrier — sits in an `ACTIVE_BUILD`
module at the authorized horizon.**

**What is built:** 35 migrations; five packages (`config`, `schemas`, `context`, `identity`,
`database`); identity and authority; kill switches; append-only audit and outbox; the network
participant registry (0028), event journal (0029), transport intent (0030), disclosure
authorization (0032), sensitivity ceiling (0033), authorized delivery (0034) and external transport
foundation (0035).

**What is not built:** any freight domain table (no shipments, loads, journeys, stops, custody
events, facilities, appointments, vehicle visits, detention clocks, goods receipts, carriers,
drivers, equipment); any agent runtime, model gateway, tool registry or policy engine; any
`WorkUnit`, `JobHandoff` or `JobCertification` construct; the `evals/` directory that all 32 agent
manifests point into.

Per §3 this absence is **not** an architecture failure — Horizon 1 forbids most of it. It is
recorded so that no claim in this audit can be read as a statement about running software.

## 7. Status

| Item                                              | Architecture status | Design status   | Implementation status          |
| ------------------------------------------------- | ------------------- | --------------- | ------------------------------ |
| Package presence and integrity                    | COMPLETE            | DESIGN_COMPLETE | IMPLEMENTED (manifests verify) |
| Declared governance precedence for v1.2/v1.3/v1.4 | COMPLETE            | DESIGN_COMPLETE | IMPLEMENTED (CI-verified)      |
| Declared governance precedence for v1.5–v1.8      | **GAP**             | DESIGN_PARTIAL  | IMPLEMENTATION_ABSENT          |
| Package ↔ ADR cross-referencing                   | **GAP**             | DESIGN_STUB     | IMPLEMENTATION_ABSENT          |
| Network ADR acceptance status                     | **CONFLICT**        | DESIGN_COMPLETE | IMPLEMENTED                    |
| Module-state scope authority                      | COMPLETE            | DESIGN_COMPLETE | IMPLEMENTED                    |
