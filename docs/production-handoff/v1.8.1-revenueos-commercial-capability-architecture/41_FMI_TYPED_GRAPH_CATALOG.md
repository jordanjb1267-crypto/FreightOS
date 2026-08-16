# 41 — Freight Market Intelligence Typed Graph Catalog

The FMI plane separates ingestion, verification, derivation, forecasting, relevance, briefing, correction, and maintenance/regulatory intelligence into independently testable graphs.

| Graph | Name | WorkUnit | Nodes | Edges | Machine-readable file |
|---|---|---|---:|---:|---|
| `FMI-G01` | Source-rights to normalized market observation | `MarketIngestionWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g01.json` |
| `FMI-G02` | Freight news verification and publication | `FreightNewsWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g02.json` |
| `FMI-G03` | Rate, capacity, and lane-state synthesis | `LaneMarketStateWorkUnit` | 7 | 7 | `graphs/fmi/fmi_g03.json` |
| `FMI-G04` | Demand, seasonality, disruption and market-regime graph | `MarketRegimeWorkUnit` | 7 | 6 | `graphs/fmi/fmi_g04.json` |
| `FMI-G05` | Forecast production and calibration | `MarketForecastWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g05.json` |
| `FMI-G06` | Customer relevance and impact graph | `CustomerMarketImpactWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g06.json` |
| `FMI-G07` | Market briefing and alert delivery | `MarketBriefingWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g07.json` |
| `FMI-G08` | Maintenance/service-market intelligence | `MaintenanceMarketWorkUnit` | 5 | 4 | `graphs/fmi/fmi_g08.json` |
| `FMI-G09` | Regulatory and policy intelligence | `RegulatoryIntelligenceWorkUnit` | 5 | 4 | `graphs/fmi/fmi_g09.json` |
| `FMI-G10` | Correction, retraction, recompute and customer notice | `MarketCorrectionWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g10.json` |

All graphs are `AUDIT_CANDIDATE`. They are not runtime implementation claims.
