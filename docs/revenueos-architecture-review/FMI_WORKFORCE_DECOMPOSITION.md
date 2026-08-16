# FMI Workforce Decomposition — 20 Candidates

Classification of every proposed role in `35_MARKET_INTELLIGENCE_AGENT_WORKFORCE.md` /
`job_books/fmi/` against the accepted repository and the accepted v1.8 workforce.

**All 20 remain `AUDIT_CANDIDATE` / `NOT_J0`. This audit promotes nothing.**

## 1. Baseline

No market, rate, capacity, news, fuel, commodity, port, rail, ocean, or maintenance-market code,
table, agent, or dataset exists. The accepted W0/W1 audit records _"no freight-domain table
(dispatch, load, shipment, appointment, facility)"_ and zero egress. Every candidate is therefore
new; none can be classified EXISTING against code.

**Ownership overlap with the accepted v1.8 workforce is real but indirect.** No FMI candidate name
matches any of the 76 accepted job names. However, four accepted v1.8 jobs already own the
_decisions_ FMI would inform, and must retain them:

| Accepted v1.8 job                                    | Owns                        | FMI must not take        |
| ---------------------------------------------------- | --------------------------- | ------------------------ |
| `carrier/profitability`                              | profitability determination | rate-based accept/reject |
| `carrier/load_discovery`, `carrier/feasibility`      | opportunity + feasibility   | load selection           |
| `brokerage/shipper_pricing`, `brokerage/margin_risk` | pricing, margin             | quote/tender/award       |
| `facility/capacity_labor`, `facility/appointment`    | capacity, appointment       | gate/dock/custody        |

`matrices/MARKET_SIGNAL_CONSUMER_MATRIX.csv` states these boundaries explicitly per consumer via a
`prohibited_direct_effect` column — a genuinely good artifact. See
[`FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md`](FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md).

## 2. Classification

| #   | Candidate                                  | Proposed                       | **Disposition**                             | Rationale                                                                                                                                                                                                                           |
| --- | ------------------------------------------ | ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `market_intelligence_orchestrator`         | deterministic_workflow         | **WORKFLOW** ✓                              | Owns nodes in 9 of 10 FMI graphs. Correct as deterministic routing; must not interpret.                                                                                                                                             |
| 2   | `source_registry_steward`                  | human_supervised_deterministic | **HUMAN_SUPERVISED** ✓                      | Correct and important — `propose_source_status_change` is propose-only. Rights decisions are legal acts.                                                                                                                            |
| 3   | `intelligence_quality_evidence_supervisor` | human_supervised_hybrid        | **HUMAN_SUPERVISED** ✓                      | Spans 7 graphs as the quality gate. Correct.                                                                                                                                                                                        |
| 4   | `freight_news_intelligence_agent`          | agent                          | **AGENT** (quarantined input)               | Correct class; **plane must be resolved** (FA-03). News is the injection surface — its output must be `UNVERIFIED` until the supervisor promotes it.                                                                                |
| 5   | `rate_intelligence_agent`                  | hybrid_agent                   | **HYBRID_AGENT** ✓                          | Methodology must be deterministic (FMI-15); judgement limited to coverage/quality.                                                                                                                                                  |
| 6   | `capacity_intelligence_agent`              | hybrid_agent                   | **HYBRID_AGENT** ✓                          | as above (FMI-16).                                                                                                                                                                                                                  |
| 7   | `lane_corridor_intelligence_agent`         | hybrid_agent                   | **MERGE** → with #5 and #6                  | Owns nodes in FMI-G03 alongside rate and capacity, on the same `LaneMarketStateWorkUnit`. Three owners on one lane-state WorkUnit is the duplicate-owner shape; one lane-state job with three deterministic calculators is cleaner. |
| 8   | `demand_volume_intelligence_agent`         | hybrid_agent                   | **MERGE** → into a single indicator service | All four (#8–#11) own nodes in FMI-G04 on one `MarketRegimeWorkUnit`.                                                                                                                                                               |
| 9   | `commodity_seasonality_intelligence_agent` | hybrid_agent                   | **MERGE** → as #8                           | as above                                                                                                                                                                                                                            |
| 10  | `disruption_intelligence_agent`            | hybrid_agent                   | **MERGE** → as #8                           | as above                                                                                                                                                                                                                            |
| 11  | `fuel_energy_intelligence_service`         | deterministic_hybrid           | **DETERMINISTIC_SERVICE**                   | Fuel is a published price series — no judgement required. Reclassify away from hybrid.                                                                                                                                              |
| 12  | `ocean_port_intelligence_agent`            | hybrid_agent                   | **GENUINELY_MISSING (deferred)**            | **Owns no graph node** despite declaring FMI-G04 membership (FA-02). Also: `ocean_adapter` is `INTERFACE_AND_SIMULATION_ONLY`, `earliest_horizon: 3`. Out of horizon — defer, do not build.                                         |
| 13  | `rail_intermodal_intelligence_agent`       | hybrid_agent                   | **GENUINELY_MISSING (deferred)**            | Same: owns no node; `rail_adapter` is `INTERFACE_AND_SIMULATION_ONLY`, `earliest_horizon: 3`.                                                                                                                                       |
| 14  | `market_regime_classification_service`     | deterministic_model_service    | **DETERMINISTIC_SERVICE** ✓                 | Correct; regime labels must be reproducible.                                                                                                                                                                                        |
| 15  | `forecast_ensemble_service`                | model_deterministic_wrapper    | **DETERMINISTIC_SERVICE** ✓                 | Correct. Calibration (FMI-17) and uncertainty (FMI-18) are testable properties of a service, not of an agent.                                                                                                                       |
| 16  | `customer_relevance_impact_agent`          | agent                          | **AGENT** ✓                                 | On `revenueos_fmi`. Must satisfy FMI-20 — relevance may never mutate the Twin.                                                                                                                                                      |
| 17  | `maintenance_market_intelligence_agent`    | hybrid_agent                   | **HYBRID_AGENT** ✓                          | Bounded to FMI-G08; must never reach repair spend (FMI-24).                                                                                                                                                                         |
| 18  | `regulatory_policy_intelligence_agent`     | human_supervised_agent         | **HUMAN_SUPERVISED** ✓                      | Correct — a misread regulation is a compliance event.                                                                                                                                                                               |
| 19  | `market_briefing_agent`                    | agent                          | **AGENT** ✓                                 | `deliver_market_brief` is publication; gated by `Commercial Compliance Guard` on FMI-G07.                                                                                                                                           |
| 20  | `market_alerting_service`                  | deterministic_workflow         | **WORKFLOW** ✓                              | Correct — alerting must be deterministic or it becomes an urgency generator.                                                                                                                                                        |

### Disposition totals

| Disposition                                  | Count | Candidates                                  |
| -------------------------------------------- | ----: | ------------------------------------------- |
| WORKFLOW                                     |     2 | 1, 20                                       |
| HUMAN_SUPERVISED                             |     4 | 2, 3, 18 (+#4 output quarantine)            |
| DETERMINISTIC_SERVICE                        |     4 | 11, 14, 15 (+ reclass)                      |
| HYBRID_AGENT                                 |     3 | 5, 6, 17                                    |
| AGENT                                        |     3 | 4, 16, 19                                   |
| MERGE                                        |     4 | 7 → {5,6}; 8, 9, 10 → one indicator service |
| GENUINELY_MISSING (deferred, out of horizon) |     2 | 12, 13                                      |
| DUPLICATE / NOT_APPROPRIATE                  |     0 | —                                           |

**Net effect: 20 proposed → 14 distinct components in scope**, plus 2 deferred beyond Horizon 1.
The merges remove four same-WorkUnit co-owners, which is the specific defect that produces
ambiguous state ownership.

## 3. Authoritative inputs, permitted outputs, prohibited commands

Uniform across all 20, from `MARKET_INTELLIGENCE_WORKFORCE_MATRIX.csv`:

- `may_publish_fmi: true` (20/20) — output is a typed FMI artifact, never a domain record.
- `may_execute_logistics_command: false` (20/20) — **no FMI component may command.**
- `requires_source_rights: true` (20/20) — no signal without rights.
- `requires_job_certification: true` (20/20) — no publication without J-certification.

Only two FMI components name any command at all: `market_intelligence_orchestrator`
(`publish_fmi_artifact`) and `market_briefing_agent` (`deliver_market_brief`,
`deliver_market_correction`) — both publication verbs. `source_registry_steward` proposes only.
The remaining 17 carry `none_without_separate_command_contract`.

**This satisfies the Section 13 invariant "FMI supplies evidence; operational domains retain
decisions and commands" at the workforce layer.** The gap is at the graph layer, where the
consuming side (`XC5_COMMAND`) has no owner — see FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.

## 4. Shared substrate vs participant legal plane

| Component                           | Belongs to                                                                |
| ----------------------------------- | ------------------------------------------------------------------------- |
| #1, #2, #3, #5–#11, #14, #15, #17   | **shared substrate** — provenance-bearing signals, no customer identity   |
| #4 (unresolved), #16, #18, #19, #20 | **RevenueOS / customer-facing** — carries customer identity and relevance |
| #12, #13                            | deferred beyond Horizon 1                                                 |

The split is materially correct. The single unresolved case (#4) is recorded as FA-03.

## 5. Certification implications

Identical to the RevenueOS plane: no FMI candidate may reach J0 until it declares `owns`
(the provisional schema forbids the field — conflict **C-04**), its graph's terminal states are
defined and owned, and GR-01..GR-32 pass. All 20 currently fail all three.
