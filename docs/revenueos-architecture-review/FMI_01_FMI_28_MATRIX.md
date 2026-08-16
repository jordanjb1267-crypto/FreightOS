# FMI-01 … FMI-28 Acceptance Gate Matrix

Gates from `37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md`, scored against the repository at
`54c55c5`. **No market or news source was contacted, connected, licensed, scraped, or ingested
during this audit.**

## Scoring rules

As in the REV matrix. Every FMI ingestion gate is currently **vacuously safe** — ingestion is
impossible because `config/network/egress-allowlist.json` has `expectedCount: 0, modules: []`,
enforced by `scripts/check-network-egress.mjs` and `scripts/check-egress-allowlist.mjs`. Vacuous
safety never scores PASS.

## Totals

|  PASS | PARTIAL |  FAIL | NOT_IMPLEMENTED | N/A |  Total |
| ----: | ------: | ----: | --------------: | --: | -----: |
| **1** |  **13** | **0** |          **14** |   0 | **28** |

## Matrix

| Gate   | Title                                  | Status              | Evidence                                                                                                                                                                                                                                                                    |
| ------ | -------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FMI-01 | Canonical source registry              | **NOT_IMPLEMENTED** | `matrices/MARKET_SOURCE_CLASSIFICATION_MATRIX.csv` classifies 8 source _classes_, not sources. No registry table, config, or `source_id` exists (MS-01).                                                                                                                    |
| FMI-02 | Rights before ingestion                | **NOT_IMPLEMENTED** | _vacuous_ — zero egress. Six required rights fields (API, derived, display, redistribution, retention, attribution) all absent. `source_registry_steward` is correctly propose-only.                                                                                        |
| FMI-03 | Provenance preserved                   | **NOT_IMPLEMENTED** | `schemas/market-signal.schema.json` defines shape; no runtime record. Repository provenance machinery (`handoff-provenance.json`, sha256-pinned) governs packages, not observations (MS-02).                                                                                |
| FMI-04 | Raw/derived/forecast separation        | **PARTIAL**         | Best-supported FMI gate: separate schemas (`market-signal`, `market-forecast-envelope`), separate WorkUnit types (`MarketIngestionWorkUnit`, `LaneMarketStateWorkUnit`, `MarketForecastWorkUnit`), separate graphs (FMI-G01 → G03 → G05). Design only.                      |
| FMI-05 | Freshness is explicit                  | **PARTIAL**         | Freshness present in schemas; `STALE` and `SOURCE_SUSPENDED` declared as terminals but **not defined as nodes** — nothing owns marking a signal stale. Node `timeout` (`PT15M`/`PT30M`) is an execution deadline, not a data-freshness bound (MS-03).                       |
| FMI-06 | Corrections append lineage             | **PARTIAL**         | FMI-G10 (`MarketCorrectionWorkUnit`, 6 nodes) genuinely present; `fixtures/commission-correction.json`. No link from a correction to the derived signals it invalidates (MS-04).                                                                                            |
| FMI-07 | Duplicate ingestion is idempotent      | **NOT_IMPLEMENTED** | FMI-G01 `F3_INGEST` is `external_read` with `retry_policy: bounded_retry`, **not** `idempotent_retry`; no ingestion key defined (FA-04 / GF-02).                                                                                                                            |
| FMI-08 | Conflicting sources remain explainable | **NOT_IMPLEMENTED** | No conflict record; `DISPUTED` is an undefined terminal.                                                                                                                                                                                                                    |
| FMI-09 | Source outage fails safely             | **PARTIAL**         | `SOURCE_SUSPENDED` and `STALE` are named destinations with **no node, no owner, no timeout, no exit**; FMI-G11-equivalent recovery is Twin-side only. Design intent present, mechanism unowned (FA-05).                                                                     |
| FMI-10 | Customer-private isolation             | **PARTIAL**         | Real substrate: `FORCE` RLS across 16 migrations; fail-closed capability matrix (`packages/context/src/capabilities.ts`, `0022`). No FMI data exists to isolate.                                                                                                            |
| FMI-11 | Network aggregate privacy              | **NOT_IMPLEMENTED** | No aggregate exists. The correct mechanism — `network_disclosure_projections` + `network_disclosure_sensitivities` (`0032`, `0033`) — is not referenced by the FMI design (MS-07).                                                                                          |
| FMI-12 | Licensed-data enforcement              | **NOT_IMPLEMENTED** | No license record; `licensed_market_data` and `licensed_news` classes correctly separate API / derived / display rights in the CSV, with nothing to enforce them.                                                                                                           |
| FMI-13 | News injection resistance              | **PARTIAL**         | Structural mitigation is real: invariant _"free-form text never grants authority"_ in 36/36 graphs, and `authority_check` is a controlled enumeration (25 values), not free text. No LLM exists to attack; no adversarial test (MS-08).                                     |
| FMI-14 | Rumor/claim labeling                   | **PARTIAL**         | `UNVERIFIED` and `DISPUTED` declared as terminals in FMI graphs; **neither is a defined node**, so nothing owns applying or clearing the label. `freight_news_intelligence_agent` correctly proposed as an agent under supervision.                                         |
| FMI-15 | Rate signal methodology                | **NOT_IMPLEMENTED** | `rate_intelligence_agent` design only; no methodology artifact, no coverage/sample definition.                                                                                                                                                                              |
| FMI-16 | Capacity signal methodology            | **NOT_IMPLEMENTED** | `capacity_intelligence_agent` design only.                                                                                                                                                                                                                                  |
| FMI-17 | Forecast calibration                   | **NOT_IMPLEMENTED** | Requires outcome history, which requires ingestion. `forecast_ensemble_service` design only.                                                                                                                                                                                |
| FMI-18 | Forecast uncertainty                   | **PARTIAL**         | `schemas/market-forecast-envelope.schema.json` carries uncertainty, and FMI-G05 makes forecast a distinct state on a distinct WorkUnit type — a real separation, unimplemented.                                                                                             |
| FMI-19 | Customer relevance explainability      | **NOT_IMPLEMENTED** | `customer-market-relevance-profile.schema.json` design only; no explanation artifact.                                                                                                                                                                                       |
| FMI-20 | Relevance cannot mutate Twin           | **PARTIAL**         | Design correct — relevance profile is a separate schema from Twin configuration, and `customer_relevance_impact_agent` owns FMI-G06/G08 nodes with `side_effect_class: none`. No Twin config exists to mutate (_vacuous_).                                                  |
| FMI-21 | Carrier execution separation           | **PARTIAL**         | `MARKET_SIGNAL_CONSUMER_MATRIX.csv` Carrier row prohibits _"load acceptance; driver assignment; negotiation without domain authority"_; no FMI→command edge exists in any graph. Weakened by FC-02: XPL-G02 is structurally identical to the other four consumption graphs. |
| FMI-22 | Brokerage execution separation         | **PARTIAL**         | Broker row prohibits _"quote/tender/award bypassing pricing-credit-margin authority"_. XPL-G03 contains **no brokerage legal gate**, though `digital_brokerage` is `LEGAL_AND_MARKET_GATED` with `BROKERAGE_EXECUTION_ENABLED: false` (FC-04).                              |
| FMI-23 | Facility physical-authority separation | **PARTIAL**         | FacilityOS row prohibits _"gate admission; dock assignment; custody"_. XPL-G04's generic `logistics_command` does not inherit `safety_critical_motion_control: prohibited` (FC-03).                                                                                         |
| FMI-24 | Maintenance spend/dispatch separation  | **PARTIAL**         | `maintenance_market_intelligence_agent` bounded to FMI-G08 with `may_execute_logistics_command: false`; XPL-G06 command executor is unowned (FC-01 / C-05).                                                                                                                 |
| FMI-25 | RevenueOS separation                   | **PARTIAL**         | Genuinely well done: FMI graphs split across `shared_fmi` (7) and `revenueos_fmi` (3); `Commercial Compliance Guard` owns nodes only on `revenueos_fmi`. Weakened by the plane inconsistency for `Freight News Intelligence Agent` (FA-03).                                 |
| FMI-26 | Customer brief truthfulness            | **NOT_IMPLEMENTED** | Requires the Promise Firewall (REV-20, NOT_IMPLEMENTED) plus confidence/thin-sample states that are undefined nodes (MS-05).                                                                                                                                                |
| FMI-27 | Observability                          | **NOT_IMPLEMENTED** | No FMI metrics, no quality telemetry.                                                                                                                                                                                                                                       |
| FMI-28 | No documentation-only PASS             | **PASS**            | 20/20 FMI components `AUDIT_CANDIDATE` / `NOT_J0`; all 10 FMI graphs `AUDIT_CANDIDATE`; `MARKET_INTELLIGENCE_WORKFORCE_MATRIX.csv` sets `requires_job_certification: true` for all 20; this audit applies the rule.                                                         |

## The five uniform strengths behind the PARTIAL scores

From `matrices/MARKET_INTELLIGENCE_WORKFORCE_MATRIX.csv`, for **all 20** components:

- `may_execute_logistics_command: false`
- `may_publish_fmi: true` (output is a typed artifact, never a domain record)
- `requires_source_rights: true`
- `requires_job_certification: true`

and, from the graphs: **no edge anywhere connects an FMI node directly to a command node.**

The forbidden path _FMI signal → command_ is structurally absent from the package. That is why
FMI-21..FMI-25 score PARTIAL rather than FAIL — the boundary exists in shape, and fails only in
binding (unowned executor, one shared WorkUnit type, missing legal/physical gates in the graphs).

## Blockers among FMI gates

1. **FMI-01 / FMI-02 / FMI-12** — no source registry; nothing may be ingested until it exists.
2. **FMI-05 / FMI-09 / FMI-14** — the safe-fail and labelling states (`STALE`, `SOURCE_SUSPENDED`,
   `UNVERIFIED`, `DISPUTED`, `THIN_MARKET`) are declared terminals with no node and no owner.
3. **FMI-07** — ingestion is not idempotent in the design.
4. **FMI-22 / FMI-23** — the brokerage legal gate and the facility physical-authority prohibition
   are absent from the graphs that would carry them.
