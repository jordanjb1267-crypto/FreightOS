# 32 — Market Data Source, Rights, and Provenance Standard

## 1. Source registry

Every FMI source SHALL be registered before production use.

Required fields:

- source ID;
- provider/owner;
- source class;
- access method;
- permitted use;
- redistribution rights;
- derived-data rights;
- customer-display rights;
- model-training/learning rights if relevant;
- retention limits;
- refresh cadence;
- expected latency;
- geographic/mode coverage;
- known biases/coverage gaps;
- cost/meter;
- credentials/connector class;
- legal/commercial owner;
- technical owner;
- suspension/kill switch;
- effective/version dates.

## 2. Source classes

1. `official_public` — government/regulator/statistical authority.
2. `industry_public` — associations/industry reports with explicit public-use terms.
3. `licensed_market_data` — commercial data under contract/API/license.
4. `licensed_news` — content/feeds with explicit permitted machine use and display rights.
5. `customer_private` — one customer's data, scoped to that customer unless separate lawful authorization exists.
6. `network_aggregate` — privacy/contract-governed FreightOS-derived aggregate.
7. `partner_contributed` — governed external-partner data.
8. `open_web_observation` — public page/event metadata only where collection and downstream use are legally/contractually permitted.

## 3. Rights before ingestion

Technical accessibility is not permission.

A crawler, browser, API token, or public webpage does not by itself establish rights to:

- bulk collect;
- retain indefinitely;
- train models;
- redistribute;
- display full content;
- create commercial derived datasets;
- resell data.

Source rights must be explicit and auditable.

## 4. Provenance envelope

Every normalized observation SHALL retain:

- `source_id`;
- `source_record_id` or stable reference where available;
- source published/effective timestamp;
- observed/ingested timestamp;
- transformation version;
- original units;
- normalized units;
- geography/lane/mode scope;
- confidence/quality state;
- rights policy/version;
- lineage to derived signals.

## 5. News handling

News-derived signals SHALL distinguish:

- reported fact;
- source allegation/claim;
- official announcement;
- analyst interpretation;
- FreightOS-derived operational implication.

Headlines or model summaries cannot convert an unverified claim into authoritative truth.

## 6. Source quality

Source quality scoring may include:

- authority;
- directness;
- sample size/coverage;
- recency;
- historical reliability;
- geographic fit;
- market representativeness;
- methodology transparency;
- corroboration.

A source-quality score is not a substitute for provenance.

## 7. Conflicting sources

When credible sources conflict:

- preserve both observations;
- show methodology/scope differences;
- avoid false precision;
- derive a consensus only through a versioned method;
- mark unresolved divergence;
- prevent lower-confidence conflict from silently overwriting stronger evidence.

## 8. Vendor outage/degradation

Every paid/critical source requires:

- freshness monitoring;
- circuit breaker;
- source health state;
- fallback or HOLD behavior;
- customer-visible staleness where consequential;
- reconciliation after recovery.

Stale data cannot masquerade as current market state.
