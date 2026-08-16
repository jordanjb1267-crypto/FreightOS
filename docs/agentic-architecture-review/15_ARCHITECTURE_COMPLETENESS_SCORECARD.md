# 15 — Architecture Completeness Scorecard

Both dimensions reported separately per §3. `DESIGN_COMPLETE + IMPLEMENTATION_ABSENT` is not a
failure; `DESIGN_STUB` is. Scores reflect the post-adversarial position, not the first pass.

## 1. Package-level

| Package                          | Docs | Lines   | Design             | Architecture | Notes                                                                                                                                                                |
| -------------------------------- | ---- | ------- | ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.5 Enterprise Agent Operations | 19   | 2,415   | **DESIGN_PARTIAL** | PARTIAL      | Strongest domain package. COT assertion sub-model is the best object in the corpus. Contradicts ADR-0018 (autonomy grant) and ADR-N0003 (delegation).                |
| FacilityOS v1.0.0                | 24   | 1,957   | **DESIGN_PARTIAL** | PARTIAL      | Substantive domain design incl. a 213-line BOL chapter and typed visit/document schemas. Detention lacks the fail-closed rule ADR-0025 requires. Untyped assertions. |
| v1.6 Brokerage                   | 25   | 1,899   | **DESIGN_PARTIAL** | PARTIAL      | The most complete operational chain in the corpus and correct on the legal gate throughout; A4 language unqualified by the computed ceiling.                         |
| v1.7 Network Coherence           | 22   | 1,460   | **DESIGN_PARTIAL** | PARTIAL      | Describes the reconciliation rather than performing it. Two artifact vocabularies. Honest about SOT/SPOT. `01_` is the corpus's only unqualified claim document.     |
| v1.8 Workforce Engineering       | 13   | **343** | **DESIGN_STUB**    | **GAP**      | Doctrine partly correct; every standard violated by its own instances; 41 of 76 jobs are stubs.                                                                      |

## 2. By audit dimension

| §   | Dimension                                  | Design                                             | Architecture                      | Implementation                          |
| --- | ------------------------------------------ | -------------------------------------------------- | --------------------------------- | --------------------------------------- |
| 5   | Package internal completeness              | DESIGN_PARTIAL ×4, DESIGN_STUB ×1                  | PARTIAL                           | IMPLEMENTATION_ABSENT                   |
| 6   | Upstream → workforce coverage              | DESIGN_PARTIAL                                     | PARTIAL                           | —                                       |
| 6   | Workforce → upstream justification         | DESIGN_COMPLETE                                    | COMPLETE                          | —                                       |
| 6   | Job-level design sufficiency               | **DESIGN_STUB**                                    | **GAP**                           | IMPLEMENTATION_ABSENT                   |
| 7   | Twin family coherence                      | DESIGN_PARTIAL                                     | PARTIAL / DUPLICATED              | —                                       |
| 7   | SOT / SPOT                                 | **DESIGN_STUB**                                    | DEFERRED_BY_DESIGN                | —                                       |
| 7   | Fact lifecycle                             | DESIGN_COMPLETE (COT) / **DESIGN_STUB** (FOT, BOT) | PARTIAL                           | —                                       |
| 7   | Semantic diff + certification impact       | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 8   | WorkUnit construct                         | DESIGN_PARTIAL                                     | PARTIAL                           | IMPLEMENTATION_ABSENT                   |
| 8   | WorkUnit state machine                     | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 8   | Ownership transfer / acceptance            | DESIGN_PARTIAL                                     | PARTIAL                           | —                                       |
| 8   | Idempotency scope                          | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 8   | Completion criteria                        | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 8   | Nine traced workflows                      | 3 PARTIAL / 6 STUB                                 | **GAP**                           | —                                       |
| 9   | Cross-company doctrine                     | **DESIGN_COMPLETE**                                | COMPLETE                          | —                                       |
| 9   | Interaction registry (16 attributes)       | **DESIGN_STUB** (2/16)                             | **GAP**                           | —                                       |
| 9   | Endpoint typing                            | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 9   | Artifact vocabulary                        | **DESIGN_STUB**                                    | **CONFLICT** (3 vocabularies)     | —                                       |
| 9   | Evidence chain                             | DESIGN_PARTIAL                                     | PARTIAL                           | IMPLEMENTED at platform layer           |
| 10  | Canonical action vocabulary                | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 10  | Per-action authority attributes            | **DESIGN_STUB** (2/12)                             | **GAP**                           | —                                       |
| 10  | Typed-command contract                     | **DESIGN_STUB**                                    | **GAP**                           | IMPLEMENTATION_ABSENT                   |
| 11  | Legal-authority model                      | **DESIGN_COMPLETE**                                | COMPLETE                          | **IMPLEMENTED**                         |
| 11  | v1.7 plane model                           | DESIGN_PARTIAL                                     | **CONFLICT**                      | —                                       |
| 11  | Service plane legal context                | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 11  | Tenant / organization / principal          | **DESIGN_COMPLETE**                                | COMPLETE                          | **IMPLEMENTED**                         |
| 11  | Delegation (layer C)                       | **DESIGN_STUB**                                    | **GAP**                           | explicitly not authorized               |
| 11  | Autonomy ceiling computation               | **DESIGN_COMPLETE**                                | COMPLETE                          | **IMPLEMENTED** (configuration control) |
| 11  | Job-declared autonomy                      | **DESIGN_STUB** (0/76)                             | **GAP**                           | —                                       |
| 11  | Legal activation gates                     | **DESIGN_COMPLETE**                                | COMPLETE                          | **IMPLEMENTED**                         |
| 12  | Exception lifecycle                        | DESIGN_PARTIAL                                     | PARTIAL                           | —                                       |
| 12  | Exception ownership                        | **DESIGN_STUB** (0/11)                             | **GAP**                           | —                                       |
| 12  | Reconciliation                             | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 12  | Crash / duplicate / partial write          | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 12  | Degraded mode + fail-closed rules          | DESIGN_PARTIAL                                     | PARTIAL                           | —                                       |
| 13  | Certification framework                    | **DESIGN_COMPLETE**                                | COMPLETE                          | IMPLEMENTATION_ABSENT                   |
| 13  | Certification contract                     | DESIGN_PARTIAL                                     | **CONFLICT** (validates empty A5) | —                                       |
| 13  | Job-specific certification                 | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 13  | Approving authority                        | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 14  | Simulations (7)                            | **DESIGN_STUB** ×7                                 | **GAP**                           | —                                       |
| 14  | Required workflow coverage                 | 7/9 stub, 2/9 absent                               | **GAP**                           | —                                       |
| 15  | No-fork doctrine                           | **DESIGN_COMPLETE**                                | COMPLETE                          | —                                       |
| 15  | Onboarding (carrier/facility/broker)       | **DESIGN_COMPLETE**                                | COMPLETE                          | —                                       |
| 15  | Onboarding (shipper/service provider)      | **DESIGN_STUB**                                    | **GAP**                           | —                                       |
| 15  | Non-native counterparty adoption           | **DESIGN_COMPLETE**                                | COMPLETE                          | —                                       |
| 15  | Capability-pack instances                  | **DESIGN_STUB** (0 exist)                          | **GAP**                           | —                                       |
| 16  | Mode-neutral core                          | **DESIGN_COMPLETE**                                | COMPLETE                          | IMPLEMENTATION_ABSENT                   |
| 16  | Road / rail / ocean packs                  | DESIGN_PARTIAL                                     | DEFERRED_BY_DESIGN                | —                                       |
| 17  | RigDesk boundary statement                 | **DESIGN_COMPLETE**                                | COMPLETE                          | —                                       |
| 17  | RigDesk contract + interface               | **DESIGN_STUB**                                    | **GAP**                           | R-07 open                               |
| 17  | 13 service semantics                       | 11 STUB / 2 PARTIAL                                | **GAP**                           | —                                       |
| 17  | Physical-control boundary                  | **DESIGN_COMPLETE**                                | COMPLETE                          | **IMPLEMENTED** (CI-enforced)           |
| 18  | Claim ladder doctrine                      | DESIGN_PARTIAL                                     | PARTIAL                           | —                                       |
| 18  | Forbidden-claims list                      | **DESIGN_COMPLETE**                                | COMPLETE                          | —                                       |
| —   | Governance-layer declaration for v1.5–v1.8 | **DESIGN_STUB**                                    | **GAP**                           | IMPLEMENTATION_ABSENT                   |
| —   | Acceptance-gate evidence format            | **DESIGN_STUB**                                    | **GAP**                           | regression vs v1.3/v1.4                 |

## 3. Participant plane scorecard

| Plane                | Upstream design                           | Workforce design                                                      | Legal context                         | Module state                            | Simulation            | Verdict                                         |
| -------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------- | --------------------------------------- | --------------------- | ----------------------------------------------- |
| **Carrier**          | v1.5, 2,415 lines                         | 14 jobs, real commands, 29 atlas edges, 14/14 with job-specific evals | `carrier_agent` + `carrier`           | ACTIVE_BUILD h1, A3                     | 2 stubs               | **DESIGN_PARTIAL** — the only plane above stub  |
| **Brokerage**        | v1.6, 1,899 lines                         | 22 jobs, real commands, 32 atlas edges, **0/22 job-specific evals**   | `brokerage` + `brokerage`             | LEGAL_AND_MARKET_GATED, execution false | 1 stub                | **DESIGN_PARTIAL**, legally barred              |
| **Facility**         | FacilityOS, 1,957 lines                   | 18 jobs, **all stubs**                                                | `software_only` + `facility_operator` | PROMOTION_GATED ≥h2                     | 1 stub (inbound only) | **DESIGN_STUB** — upstream exists, undecomposed |
| **Shipper**          | v1.7 `10_`, 52 lines, "architecture only" | 12 jobs, **all stubs**, 1:1 from a bullet list                        | `software_only` + `shipper_owned`     | PROMOTION_GATED ≥h2                     | 1 stub                | **DESIGN_STUB** — deferred upstream             |
| **Service provider** | v1.7 `11_`, 46 lines, "future"            | 10 jobs, **all stubs**, 1:1 from a bullet list                        | **none representable**                | **no module entry**                     | 1 stub                | **DESIGN_STUB** — and Ruling C forbids the work |

## 4. Answering §22 Q3–Q5

**Q3 — which planes are DESIGN_COMPLETE?** **None.**

**Q4 — which are DESIGN_PARTIAL?** Carrier and brokerage.

**Q5 — which contain DESIGN_STUBS?** All five. Facility, shipper and service provider are stubs
throughout; carrier and brokerage contain stubs at the WorkUnit, command-attribute, evaluation,
simulation and interaction-registry layers.

## 5. Weighted summary

| Band                                                                | Count  | Examples                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DESIGN_COMPLETE + IMPLEMENTED**                                   | 7      | legal-authority model; tenant/org/principal; disclosure stack; N4 transport intent; module-state authority; physical-control prohibition; autonomy-ceiling computation (configuration control)            |
| **DESIGN_COMPLETE + IMPLEMENTATION_ABSENT** (correct for Horizon 1) | 9      | cross-company doctrine; certification framework; forbidden-claims list; no-fork doctrine; three onboarding sequences; counterparty adoption; mode-neutral core; RigDesk boundary; module dependency graph |
| **DESIGN_PARTIAL**                                                  | 18     | four domain packages; Twin family; WorkUnit; exception lifecycle; evidence chain; claim ladder; deployment topology                                                                                       |
| **DESIGN_STUB**                                                     | **31** | 41 jobs; 7 simulations; interaction registry; action vocabulary; idempotency; reconciliation; exception ownership; job certification; SOT/SPOT; semantic diff; service semantics; governance declaration  |
| **CONFLICT**                                                        | 27     | see [14](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md) §A                                                                                                                                                 |
| **DEFERRED_BY_DESIGN**                                              | 7      | rail/ocean/air; runtime; domain tables; AV manifests; brokerage execution                                                                                                                                 |

## 6. The two patterns

The audit's first-pass thesis — "the doctrine is right and the conformance layer is missing" — was
downgraded by Lens A and the correction matters for remediation. There are **two** patterns, and
they need different work:

**Pattern 1 — sound doctrine, missing binding.** The standard is correct and complete; what is
missing is a schema, a validator and a CI gate. Fixable by engineering without new architecture
decisions.

Examples: v1.8 `04:21` cross-company boundary; `07:12` forbidden claims; `11:17` self-limiting
classification; the v1.5 assertion sub-model; the three onboarding sequences; the mode-neutral
core; the module dependency graph.

**Pattern 2 — the doctrine itself omits a material decision.** No conformance layer can be built
until an author or an owner supplies the missing semantics.

Examples: `04:17`'s seven-dimension predicate names _freshness_ and _authority_, which have no field
and no defined value anywhere; `05`'s exception lifecycle has no transition relation, no guards, no
owner-assignment rule and no Exception contract at all; `07`'s claim ladder has no decider and no
minimum evidence; v1.7 `03`'s fifteen mandatory Twin sections include three that all three Twins
structurally forbid; v1.5's 26 acceptance gates name no minimum evidence artifact.

Roughly half the doctrine artifacts tested fall in each pattern. A remediation plan that assumes
Pattern 1 throughout would under-scope by about half — which is precisely why the recommendation in
[16](16_REMEDIATION_OPTIONS_AND_RECOMMENDATION.md) separates the schema-and-CI work from the
design-authoring work, and why the latter is blocked on owner decisions while the former is not.
