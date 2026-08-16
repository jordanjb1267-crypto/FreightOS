# 38 — Freight Market Intelligence Source Strategy

## 1. Strategy

FreightOS should combine authoritative public data, licensed market datasets, customer-private operating data, and privacy-protected network aggregates rather than relying on a single vendor or web scraper.

## 2. Source tiers

### Tier A — authoritative/public foundations

Examples to evaluate and register include:

- U.S. Energy Information Administration fuel/energy data;
- U.S. DOT Bureau of Transportation Statistics freight indicators/FAF/TSI;
- U.S. Bureau of Labor Statistics transportation price/labor indicators;
- USDA Agricultural Marketing Service truck/rail/barge/ocean and refrigerated/produce market datasets;
- Federal Maritime Commission containerized-freight and ocean regulatory datasets;
- Maritime Administration port/vessel datasets;
- other regulator/authority feeds relevant to border, safety, weather, infrastructure, and mode-specific operations.

These provide stable macro/official context but may not provide the lane-level, high-frequency specificity required for dispatch or brokerage decisions.

### Tier B — licensed freight market data

Evaluate commercial products for:

- truckload rate benchmarks;
- lane-level capacity;
- tender/rejection/volume signals;
- high-frequency market indices;
- rate forecasts;
- multimodal market intelligence;
- API/redistribution/derived-data rights.

No vendor is architecturally mandatory. The adapter layer must preserve canonical FMI contracts.

### Tier C — customer-private data

Customer historical:

- accepted/declined loads;
- actual rates;
- deadhead;
- service failures;
- dwell;
- facility performance;
- maintenance/service events;
- equipment utilization.

This can materially improve customer-specific relevance but remains customer-scoped unless separately authorized for aggregate use.

### Tier D — FreightOS network aggregate

Long-term proprietary advantage may derive from privacy-protected network observations such as:

- anonymous lane movement density;
- aggregated service/dwell patterns;
- aggregated capacity/availability;
- normalized facility throughput indicators;
- aggregate maintenance/service demand.

These require explicit governance, minimum cohorts, anti-reidentification, contractual rights, and evidence that commercially sensitive participant data cannot be reconstructed.

## 3. Build/buy boundary

FreightOS SHOULD build:

- source registry;
- canonical market signal schema;
- provenance/rights enforcement;
- normalization;
- customer relevance/impact mapping;
- market-signal distribution;
- source-agnostic operational interfaces;
- evaluation/quality/freshness controls;
- network aggregate governance.

FreightOS SHOULD generally buy/license rather than recreate where economically sensible:

- deep proprietary lane transaction datasets;
- broad high-frequency tender/capacity datasets;
- specialized commercial news/data feeds;
- some weather/traffic/port/rail datasets where managed feeds are superior.

## 4. Scraping doctrine

Scraping is a collection mechanism, not a data strategy.

It may be used only when:

- access is lawful/contractually permitted;
- source terms permit the intended use;
- collection is technically reliable;
- provenance is preserved;
- rate limits and robots/access controls are respected as applicable;
- redistribution/derived-use rights are known;
- a source change cannot silently corrupt semantics.

Paid APIs are not automatically required, but avoiding API spend is never allowed to create legal, reliability, or evidence debt.

## 5. Resilience

No single commercial data vendor should become an unexamined constitutional dependency. Consumers declare minimum evidence needs and degraded behavior so FreightOS can switch, combine, or temporarily hold when a source fails.
