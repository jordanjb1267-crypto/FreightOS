# RevenueOS Workforce Decomposition — 17 Candidates

Classification of every proposed role in `16_REVENUEOS_AGENT_WORKFORCE.md` /
`job_books/revenueos/` against the accepted repository and the accepted v1.8 workforce.

**All 17 remain `AUDIT_CANDIDATE` / `NOT_J0`. This audit promotes nothing.**

## 1. Method

Each candidate is checked against: (a) the 76 accepted v1.8 Job Books
(`docs/production-handoff/v1.8.0-agent-workforce-engineering-certification/job_books/`);
(b) the 32 declared agent manifests in `config/agents/registry.yaml`; (c) implemented code.

**Baseline fact governing every row:** the accepted W0/W1 audit records that of v1.8's 76 jobs
**0 are implemented**, and there is _"no LLM call, prompt, model gateway client, agent loop, tool
registry or dispatcher… no supervisor/orchestrator… no workflow engine"_. No RevenueOS candidate
can therefore be classified EXISTING against code. Where a row says GENUINELY_MISSING it means
_missing as a distinct commercial responsibility_, not merely unimplemented.

Commercial responsibilities do not overlap the 76 accepted jobs at all: **0 of the 90 graph node
owners match an accepted v1.8 job name**. The v1.8 workforce is entirely operational (carrier,
brokerage, facility, shipper, service provider). There is consequently **no DUPLICATE against
v1.8** in this plane — the overlaps are internal to RevenueOS.

## 2. Classification

| #   | Candidate                         | Proposed class         | **Disposition**                      | Rationale / evidence                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------- | ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `account_intelligence_agent`      | agent                  | **MERGE** → with `prospecting_agent` | Both own REV-G01 nodes (R1_DISCOVER / R4_CONTACT) on one `CommercialProspectWorkUnit`; discovery and outreach on one WorkUnit with one owner is one job. Two books invite the duplicate-owner defect W0/W1 named 9 times.                                                                                            |
| 2   | `prospecting_agent`               | agent                  | **MERGE** (target)                   | as above                                                                                                                                                                                                                                                                                                             |
| 3   | `crm_opportunity_steward`         | hybrid                 | **DETERMINISTIC_SERVICE**            | Owns identity resolution (R2_DEDUPE) and state capture across 5 graphs. Deduplication and state recording are deterministic; `candidate_commands: record_commercial_state` is record-only. Reclassifying removes a model from the account-identity path.                                                             |
| 4   | `qualification_service`           | hybrid                 | **HYBRID_AGENT**                     | Judgement over evidence, but must not decide alone; class name should follow the v1.8 vocabulary (`component`), not a new one.                                                                                                                                                                                       |
| 5   | `discovery_copilot`               | agent                  | **AGENT** (human-facing)             | Assistive; owns REV-G02/G07 nodes with `side_effect_class: none`. Correct as an agent under ASSIST mode.                                                                                                                                                                                                             |
| 6   | `solution_configuration_agent`    | agent                  | **AGENT**                            | REV-G03; output is a proposal artifact, not an activation.                                                                                                                                                                                                                                                           |
| 7   | `roi_engine`                      | deterministic_service  | **DETERMINISTIC_SERVICE** ✓          | Correct. Arithmetic must be reproducible (REV-25/28).                                                                                                                                                                                                                                                                |
| 8   | `pricing_engine`                  | deterministic_service  | **DETERMINISTIC_SERVICE** ✓          | Correct; `explicit_non_scope` already excludes policy override and discount self-approval.                                                                                                                                                                                                                           |
| 9   | `deal_desk_coordinator`           | workflow               | **WORKFLOW** ✓                       | Correct; coordination, not decision.                                                                                                                                                                                                                                                                                 |
| 10  | `proposal_agent`                  | agent                  | **HUMAN_SUPERVISED**                 | Owns `P6_SEND` (`external_commercial_offer`). An outbound priced offer is a binding commercial act; ASSIST/approval-execute only, never bounded autonomy.                                                                                                                                                            |
| 11  | `security_rfp_agent`              | human_supervised_agent | **HUMAN_SUPERVISED** ✓               | Correct — security/compliance answers are the highest-consequence claim surface (REV-23).                                                                                                                                                                                                                            |
| 12  | `commercial_compliance_guard`     | hybrid                 | **DETERMINISTIC_SERVICE**            | Spans **10 graphs** — the widest span in the package. A guard that gates outreach, pricing, proposals, partner, handoff, expansion, commission _and_ two FMI graphs must be deterministic and registry-driven, or it becomes a model with veto authority over the entire commercial plane. H7 requires exactly this. |
| 13  | `partner_operations_agent`        | hybrid                 | **HUMAN_SUPERVISED**                 | Deal registration affects money and cross-customer visibility; `record_deal_registration` must be human-confirmed until partner isolation exists (see PARTNER_CHANNEL_GAP_MAP).                                                                                                                                      |
| 14  | `implementation_handoff_agent`    | agent                  | **WORKFLOW**                         | REV-G06 `I5_TRANSFER` is `side_effect_class: handoff_only` with `retry_policy: none` — a structured transfer, not a judgement. Deterministic workflow also fixes defect G-4 for that node.                                                                                                                           |
| 15  | `expansion_agent`                 | agent                  | **AGENT** ✓                          | Correct, provided REV-32 makes expansion reuse initial-sale controls.                                                                                                                                                                                                                                                |
| 16  | `commission_calculation_service`  | deterministic_service  | **DETERMINISTIC_SERVICE** ✓          | Correct and important: `record_*` commands only, so calculation cannot move money (REV-39).                                                                                                                                                                                                                          |
| 17  | `revenue_operations_orchestrator` | workflow_router        | **WORKFLOW** ✓                       | Correct as a router; requires the RPA-01 adversarial test.                                                                                                                                                                                                                                                           |

### Disposition totals

| Disposition           | Count | Candidates                                  |
| --------------------- | ----: | ------------------------------------------- |
| MERGE                 |     2 | 1, 2 (→ one prospect job)                   |
| AGENT                 |     3 | 5, 6, 15                                    |
| HYBRID_AGENT          |     1 | 4                                           |
| DETERMINISTIC_SERVICE |     5 | 3, 7, 8, 12, 16                             |
| WORKFLOW              |     4 | 9, 14, 17 + (10 reclass below)              |
| HUMAN_SUPERVISED      |     3 | 10, 11, 13                                  |
| DUPLICATE             |     0 | —                                           |
| EXISTING              |     0 | no commercial job exists in code or in v1.8 |
| NOT_APPROPRIATE       |     0 | —                                           |

_(WORKFLOW = 9, 14, 17; candidate 10 is HUMAN_SUPERVISED. Net distinct jobs after MERGE: **16**.)_

**Net effect: 17 proposed → 16 distinct commercial responsibilities**, of which 5 become
deterministic services and 3 become human-supervised. Nothing is rejected outright; the commercial
plane is genuinely new work with no accepted counterpart.

## 3. Structural non-conformance with the accepted v1.8 Job Book Standard

This applies to all 17 (and to the 20 FMI candidates). The accepted v1.8 Job Book shape, consistent
across all 76 books, is:

`department, slug, name, component, mission, upstream, downstream, tools, commands, owns, non_scope`

The provisional shape (`schemas/provisional-job-book.schema.json`, `additionalProperties: false`) is:

`name, slug, status, plane, proposed_class, mission, explicit_non_scope, graph_membership,
candidate_commands, production_logistics_authority, certification, audit_required`

| v1.8 field                    | v1.8.1                    | Consequence                                                                                             |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `department`                  | `plane`                   | rename only                                                                                             |
| `component`                   | `proposed_class`          | rename **and** new vocabulary — 13 values vs v1.8's `component`                                         |
| `non_scope`                   | `explicit_non_scope`      | rename only                                                                                             |
| `commands`                    | `candidate_commands`      | rename only                                                                                             |
| **`owns`**                    | **absent, and forbidden** | **no candidate declares what it is accountable for**                                                    |
| **`upstream` / `downstream`** | **absent, and forbidden** | **no typed handoff edges — the 41-orphan defect W0/W1 found in v1.8 stubs, reproduced by construction** |
| **`tools`**                   | **absent, and forbidden** | no tool surface, so no tool/command drift check is possible                                             |

Because `additionalProperties: false`, these fields cannot be added without a schema change. The
missing `owns` field is the serious one: `owns` is what makes a job accountable for a WorkUnit, and
its absence is why the "single accountable owner" invariant cannot be verified from the Job Books
at all — only from the graphs, where 55 of 90 owners have no book. Recorded as conflict **C-04**.

**Required change:** converge the provisional schema on the accepted v1.8 Job Book Standard —
restore `owns`, `upstream`, `downstream`, `tools`; keep the four RevenueOS-specific safety fields
(`status`, `production_logistics_authority`, `certification`, `audit_required`) as additive.

## 4. Certification implications

No candidate may reach J0 until: (a) it declares `owns`; (b) every graph node it owns has a defined
failure state (defect G-2); (c) its graph passes GR-01..GR-32; (d) the 13 ad-hoc `proposed_class`
values are mapped onto the accepted v1.8 `component` vocabulary. All four are currently unmet, for
all 17.
