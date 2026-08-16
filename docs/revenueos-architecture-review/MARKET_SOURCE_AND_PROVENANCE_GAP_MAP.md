# Market Source & Provenance Gap Map

Source rights, provenance, freshness, confidence, correction lineage, and forecast uncertainty as
first-class contracts. **No market source was contacted, connected, licensed, scraped, or ingested
during this audit.**

## 1. Verdict

**Every source-governance concern is designed and none is built.** The design is competent: rights
precede ingestion, provenance is required, raw/derived/forecast are separated, and corrections have
their own graph. The blocking gap is that the source registry — the object all of it depends on —
does not exist in any form beyond an 8-row classification CSV.

## 2. Source classification, as designed

`matrices/MARKET_SOURCE_CLASSIFICATION_MATRIX.csv`, 8 classes with stated production requirements:

| Class                  | Example purpose                                    | Production requirement                                   |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `official_public`      | macro, fuel, regulatory, public freight statistics | registered source + provenance + refresh/freshness rules |
| `industry_public`      | industry traffic/indices/reports                   | terms/right review + methodology/coverage                |
| `licensed_market_data` | lane rates, capacity, tender/volume                | **executed license + API/derived/display rights**        |
| `licensed_news`        | freight/logistics news and alerts                  | **executed content/machine-use/display rights**          |
| _(4 further classes)_  |                                                    |                                                          |

The distinction that matters most is present: a license to _receive_ data is not a license to
_derive_ from it, nor to _display_ it to a customer. `licensed_market_data` names all three rights
separately. This is the correct granularity for FMI-12 and for the customer-brief surface.

## 3. Gaps

### MS-01 — No source registry object exists _(blocking)_

There is no source table, no source config file, no license record, no rights field, no
`source_id`. The CSV classifies _classes of source_, not sources. Until a registry exists:

- FMI-01 (canonical source registry) — NOT_IMPLEMENTED
- FMI-02 (rights before ingestion) — NOT_IMPLEMENTED
- FMI-12 (licensed-data enforcement) — NOT_IMPLEMENTED

`source_registry_steward`'s only command is `propose_source_status_change` — propose-only, which is
correct: adding a source is a legal act, not an operational one.

### MS-02 — Provenance has no carrier

FMI-03 requires provenance be preserved. `schemas/market-signal.schema.json` defines the signal
shape, but no runtime record exists, and the repository's provenance machinery
(`handoff-provenance.json` + `scripts/check-handoff-provenance.mjs`, which pins content by sha256)
governs handoff packages, not market observations. The pattern is available and unreferenced.

### MS-03 — Freshness is a field with no clock

FMI-05 requires explicit freshness. `STALE` and `SOURCE_SUSPENDED` are declared terminal states in
the FMI graphs, but **neither is defined as a node** — so nothing owns marking a signal stale, and
nothing owns un-marking it. Node timeouts (`PT15M`, `PT30M`) are per-node execution deadlines, not
data-freshness bounds; the two are different clocks and the package uses only the first.
**Required change:** a per-source freshness bound and an owned state transition to `STALE`.

### MS-04 — Correction lineage exists as a graph, not as a link

FMI-G10 (`MarketCorrectionWorkUnit`, 6 nodes) is genuinely present and is the right structure.
But nothing binds a correction to the derived signals it must invalidate. GR-26 (correction
propagation) and GR-27 (forecast invalidation) score PARTIAL and NOT_IMPLEMENTED respectively.
The repository already models corrective append correctly in
`network_disclosure_grant_revocations` (`0032`) — revocation as a separate, linked append rather
than a mutation. Reuse it.

### MS-05 — Confidence and thin samples have unowned outcomes

`THIN_MARKET`, `UNVERIFIED`, `DISPUTED`, `NOT_COMPUTABLE` are declared terminals in FMI graphs and
**none is a defined node**. The adversarial requirement "a thin-lane sample is not presented as
high-confidence market truth" therefore has a named destination and no accountable owner.

### MS-06 — Forecast uncertainty is schema-only

`schemas/market-forecast-envelope.schema.json` carries uncertainty; FMI-G05 separates forecast from
observation as a distinct state and `MarketForecastWorkUnit` is a distinct type — so FMI-04 (raw /
derived / forecast separation) is the best-supported FMI gate and scores PARTIAL on design
strength. Calibration (FMI-17) requires outcome history that cannot exist without ingestion.

### MS-07 — Cross-tenant aggregation privacy is unaddressed at the source layer

FMI-11 requires network-aggregate privacy. If customer-private tender or rate data ever contributes
to a network aggregate, re-identification is the hazard. The repository's answer already exists —
`network_disclosure_projections` + `network_disclosure_sensitivities` (`0032`, `0033`) — and the FMI
design does not reference it. **Required change:** any network aggregate must be a disclosure
projection with a sensitivity ceiling, not a query.

### MS-08 — Prompt injection is mitigated only by an untested invariant

FMI-13 requires news-injection resistance. All 36 graphs declare _"free-form text never grants
authority"_, and `authority_check` is an enumerated vocabulary (25 distinct values) rather than free
text — a real structural mitigation. But no test exercises it, and there is no LLM to attack yet.
Scored PARTIAL on the structural mitigation, not on the absent test.

## 4. Rights-to-use matrix — what must be true before any ingestion

| Right               | Needed for                     | Registry field required   | Exists |
| ------------------- | ------------------------------ | ------------------------- | ------ |
| Receive/API         | ingestion                      | `api_rights`              | **no** |
| Derive              | indicators, regimes, forecasts | `derived_data_rights`     | **no** |
| Display to customer | briefs, alerts                 | `customer_display_rights` | **no** |
| Redistribute        | network projection             | `redistribution_rights`   | **no** |
| Retain              | history, calibration           | `retention_terms`         | **no** |
| Attribute           | required attribution text      | `attribution_requirement` | **no** |

**Six required rights fields; zero exist.** This table is the minimum content of the registry
MS-01 calls for, and is the reason the proposed sequence places the source registry before any FMI
component.

## 5. Required changes

1. Build the source registry with all six rights fields; no ingestion before it (**MS-01**,
   blocking).
2. Define and own `STALE`, `SOURCE_SUSPENDED`, `THIN_MARKET`, `UNVERIFIED`, `DISPUTED`,
   `NOT_COMPUTABLE` (**MS-03, MS-05**, blocking).
3. Bind corrections to derived signals, reusing the revocation-by-append pattern (**MS-04**).
4. Network aggregates become disclosure projections with sensitivity ceilings (**MS-07**).
5. Add an adversarial injection test before any model reads a news source (**MS-08**).
