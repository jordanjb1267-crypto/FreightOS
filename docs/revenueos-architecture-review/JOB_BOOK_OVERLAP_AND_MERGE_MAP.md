# Job Book Overlap & Merge Map — 37 Provisional Candidates

Reconciliation of the 37 `AUDIT_CANDIDATE` Job Books against the 76 accepted v1.8 Job Books, the 32
declared agent manifests, and implemented code.

**Nothing here promotes any candidate. All 37 remain `AUDIT_CANDIDATE` / `NOT_J0`.**

## 1. Headline

| Question                                                | Answer                                       |
| ------------------------------------------------------- | -------------------------------------------- |
| Candidates that duplicate an accepted v1.8 job          | **0**                                        |
| Candidate owners matching an accepted v1.8 job **name** | **0 of 90 graph owners**                     |
| Candidates classified EXISTING against code             | **0** — no commercial or market code exists  |
| Candidates recommended for internal MERGE               | **6** (2 RevenueOS, 4 FMI)                   |
| Candidates recommended for deferral (out of horizon)    | **2** (ocean/port, rail/intermodal)          |
| Candidates rejected as NOT_APPROPRIATE                  | **0**                                        |
| **Net distinct components after disposition**           | **37 → 30** (16 RevenueOS + 14 FMI in scope) |

**There is no responsibility collision between v1.8.1 and the accepted v1.8 workforce.** The 76
accepted jobs are entirely operational (carrier 14, brokerage 22, facility 18, shipper 12, service
provider 10). The 37 candidates are commercial and intelligence. The overlaps that matter are
_internal to v1.8.1_ and _at the consumption boundary_, not with v1.8 itself.

## 2. Disposition summary

Full rationale per candidate is in
[`REVENUE_WORKFORCE_DECOMPOSITION.md`](REVENUE_WORKFORCE_DECOMPOSITION.md) and
[`FMI_WORKFORCE_DECOMPOSITION.md`](FMI_WORKFORCE_DECOMPOSITION.md).

| Disposition                            | RevenueOS |    FMI |  Total |
| -------------------------------------- | --------: | -----: | -----: |
| AGENT                                  |         3 |      3 |      6 |
| HYBRID_AGENT                           |         1 |      3 |      4 |
| DETERMINISTIC_SERVICE                  |         5 |      4 |      9 |
| WORKFLOW                               |         3 |      2 |      5 |
| HUMAN_SUPERVISED                       |         3 |      4 |      7 |
| MERGE                                  |         2 |      4 |      6 |
| GENUINELY_MISSING (deferred)           |         0 |      2 |      2 |
| EXISTING / DUPLICATE / NOT_APPROPRIATE |         0 |      0 |      0 |
| **Total**                              |    **17** | **20** | **37** |

**Reclassification pressure runs consistently toward determinism**: 9 of 37 become deterministic
services and 7 become human-supervised, i.e. **16 of 37 (43%) should not be autonomous agents.**
The package proposes 10 plain `agent` and 9 `hybrid_agent`; this audit reduces the agent population
and moves calculation, guarding, and identity resolution into deterministic code. That is the same
direction the accepted W1 role decomposition took for v1.8.

## 3. The six recommended merges

| Merge    | Candidates                                                                                          | Shared WorkUnit / graph               | Reason                                                                                |
| -------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| M-1      | `account_intelligence_agent` + `prospecting_agent`                                                  | `CommercialProspectWorkUnit`, REV-G01 | discovery and outreach on one WorkUnit; two owners invites the duplicate-owner defect |
| M-2      | `lane_corridor_intelligence_agent` → `rate_` + `capacity_intelligence_agent`                        | `LaneMarketStateWorkUnit`, FMI-G03    | three owners on one lane-state WorkUnit                                               |
| M-3..M-5 | `demand_volume_`, `commodity_seasonality_`, `disruption_intelligence_agent` → one indicator service | `MarketRegimeWorkUnit`, FMI-G04       | four co-owners of one regime WorkUnit                                                 |

All six merges target the same structural hazard: **multiple owners on one WorkUnit type**. The
graphs currently avoid a literal duplicate-owner violation (0 states have two owners), but
co-ownership of a single WorkUnit across sequential nodes is how the v1.8 design accumulated the
nine duplicate-owner risks W0/W1 recorded (`W01-F-OWN-04` … `W01-F-OWN-11`). Merging now is cheaper
than merging after certification.

## 4. Structural non-conformance with the accepted Job Book Standard _(applies to all 37)_

The accepted v1.8 Job Book shape is identical across all 76 books:

`department, slug, name, component, mission, upstream, downstream, tools, commands, owns, non_scope`

`schemas/provisional-job-book.schema.json` (`additionalProperties: false`) permits only:

`name, slug, status, plane, proposed_class, mission, explicit_non_scope, graph_membership,
candidate_commands, production_logistics_authority, certification, audit_required`

| Accepted field                     | v1.8.1                                | Impact                                                 |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `department` → `plane`             | renamed                               | cosmetic                                               |
| `component` → `proposed_class`     | renamed **+ new 13-value vocabulary** | class taxonomy drift                                   |
| `non_scope` → `explicit_non_scope` | renamed                               | cosmetic                                               |
| `commands` → `candidate_commands`  | renamed                               | cosmetic                                               |
| **`owns`**                         | **forbidden**                         | **no candidate states what it is accountable for**     |
| **`upstream` / `downstream`**      | **forbidden**                         | **no typed handoff edges declared at the job layer**   |
| **`tools`**                        | **forbidden**                         | no tool surface → no tool/command drift check possible |

Two consequences worth stating plainly:

1. **`owns` is the field that makes a job accountable for a WorkUnit.** Its absence is why the
   "single accountable owner" invariant can only be checked from the graphs — where 55 of 90 owners
   have no Job Book at all.
2. **The 13 `proposed_class` values are a new vocabulary.** `hybrid` and `hybrid_agent` coexist;
   `deterministic_service`, `deterministic_hybrid`, `deterministic_model_service`,
   `deterministic_workflow`, `model_deterministic_wrapper` and `human_supervised_deterministic` are
   six overlapping determinism labels. Certification (J0–J7) is defined against the v1.8
   `component` vocabulary, so no candidate can be certified until the taxonomies converge.

Conflict **C-04**. **Required change:** converge the provisional schema on the accepted standard —
restore `owns`, `upstream`, `downstream`, `tools`; map the 13 classes onto the v1.8 `component`
vocabulary; keep `status`, `production_logistics_authority`, `certification`, `audit_required` as
additive safety fields, since those are a genuine improvement worth propagating back to v1.8.

## 5. Twin components have no Job Book at all

The 12 TWIN graphs contain **50 distinct node owners and zero Job Books**. The provisional schema
constrains `plane` to `enum: ["revenueos", "fmi"]` and `graph_membership` to
`^(REV|FMI|XPL)-G[0-9]{2}$`, so a Twin Job Book is **inexpressible by construction**.

The Operational Twin — the package's most consequential proposal, spanning system-of-record binding,
human/agent coexistence, network communication and external writeback — has no workforce
decomposition whatsoever. This is the largest single omission in v1.8.1. Conflict **C-04**;
owner decision **D-10**.

## 6. Certification implications (all 37)

No candidate may be proposed for J0 until:

1. it declares `owns` (schema change required);
2. every graph node it owns has a defined, owned failure state (GF-01);
3. its side-effecting nodes are idempotent and kill-switch-gated (GF-02, GF-03);
4. its `proposed_class` maps to an accepted v1.8 `component`;
5. its graph passes GR-01..GR-32.

**All 37 currently fail conditions 1, 2 and 4.** The 21 candidates owning side-effecting nodes also
fail 3.
