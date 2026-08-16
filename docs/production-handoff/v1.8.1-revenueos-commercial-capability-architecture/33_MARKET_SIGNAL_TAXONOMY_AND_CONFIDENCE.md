# 33 — Market Signal Taxonomy, Freshness, Confidence, and Forecast Discipline

## 1. Signal classes

Canonical classes:

- `observation` — directly observed/published value or event;
- `normalized_observation` — transformed into canonical FreightOS semantics;
- `derived_indicator` — deterministic calculation over observations;
- `forecast` — future estimate with horizon/uncertainty;
- `regime_classification` — bounded characterization such as loose/balanced/tight capacity;
- `news_event` — sourced report/announcement;
- `disruption_signal` — operational disruption with geography/time scope;
- `customer_impact_assessment` — relevance/impact interpretation for one participant;
- `recommendation_input` — evidence intended for another governed decision component.

## 2. Required fields

Every signal includes:

- immutable signal ID/version;
- signal class;
- metric/event type;
- transport mode;
- geography/lane/market scope;
- equipment/commodity scope where applicable;
- observation/effective time;
- ingested time;
- freshness state;
- valid-until or expiry logic;
- source references;
- transformation/model version;
- confidence/uncertainty;
- units and statistical basis;
- rights/access class;
- customer/network disclosure policy;
- correction lineage.

## 3. Freshness states

Use only:

- `CURRENT`
- `AGING`
- `STALE`
- `UNKNOWN`
- `WITHHELD`

Operational consumers define how each state affects their own decisions. FMI cannot silently extend validity.

## 4. Confidence

Confidence must be calibrated to the type of evidence.

Examples:

- exact published diesel price from an authoritative release: high observation confidence, limited future relevance;
- lane spot-rate estimate from a licensed sample: confidence depends on sample/recency/lane density;
- news report about a future strike: event probability and impact uncertainty must remain explicit;
- long-horizon rate forecast: never represented as a current observed rate.

## 5. Forecast envelope

Every forecast SHALL state:

- target variable;
- point/interval estimate as supported;
- horizon;
- model/version;
- training/reference window;
- known regime limitations;
- calibration/backtest metric;
- confidence/interval;
- invalidation conditions;
- generated timestamp;
- data freshness.

Forecasts cannot be labeled guaranteed, certain, or authoritative future state.

## 6. Regime detection

A Market Regime component may characterize markets using approved metrics, for example:

- `LOOSE_CAPACITY`
- `BALANCED`
- `TIGHT_CAPACITY`
- `DISRUPTED`
- `DATA_INSUFFICIENT`

The classification method must be deterministic or model-versioned and backtested. Customer-facing explanations show the evidence driving the classification.

## 7. Corrections

Corrections append lineage:

```text
signal v1
   ↓ corrected_by
signal v2
```

Do not erase the historical signal when it was consequentially consumed; preserve what the system knew at decision time.
