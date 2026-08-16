# 31 — Freight Market Intelligence Substrate

## 1. Purpose

FreightOS SHALL maintain a shared, provenance-bearing Freight Market Intelligence (FMI) substrate so commercial and operational products can reason from a coherent view of freight-market conditions without making RevenueOS an operational authority.

RevenueOS owns the **commercial/customer-facing market intelligence function**: research, synthesis, account relevance, briefings, alerts, and commercial explanation. The underlying market observations and derived signals are published through the FMI substrate for governed consumption by Carrier, Brokerage, FacilityOS, Shipper, Service Provider/RigDesk, and RevenueOS components.

## 2. Architectural position

```text
PUBLIC / LICENSED / CUSTOMER / NETWORK SOURCES
                    │
                    ▼
          SOURCE REGISTRY + RIGHTS
                    │
                    ▼
       INGESTION / NORMALIZATION LAYER
                    │
                    ▼
        FREIGHT MARKET INTELLIGENCE
              SHARED SUBSTRATE
                    │
     ┌──────────────┼───────────────────────────────┐
     │              │               │               │
 RevenueOS       Carrier         Brokerage       FacilityOS
 briefings       planning        pricing/sourcing capacity/readiness
     │              │               │               │
     └──────────────┼───────────────┼───────────────┘
                    │
               Shipper / RigDesk
```

## 3. FMI is intelligence, not authority

An FMI artifact may be an observation, normalized metric, derived indicator, forecast, interpretation, or customer-impact assessment.

An FMI artifact is **never by itself**:

- a command;
- an approval;
- a price authorization;
- a load acceptance;
- a carrier qualification decision;
- a dispatch assignment;
- a facility physical-control decision;
- a maintenance authorization;
- a customer entitlement;
- a legal/compliance determination.

Operational components may consume FMI as evidence/input only within their existing authority, policy, certification, workflow, and approval boundaries.

## 4. Covered intelligence domains

The substrate SHALL be extensible across transport modes and market domains. Initial taxonomy includes:

1. truckload spot rates;
2. truckload contract rates where licensed/available;
3. lane-level capacity tightness;
4. load-to-truck / tender / rejection / availability indicators where licensed;
5. shipment volume and demand;
6. seasonality and produce/agriculture flows;
7. fuel and energy prices;
8. labor and driver/warehouse capacity indicators;
9. weather and disaster disruptions;
10. road, bridge, border, port, rail, and terminal disruptions;
11. freight and logistics news;
12. regulatory and policy changes;
13. commodity and industrial activity affecting freight demand;
14. port/container activity;
15. rail traffic/intermodal activity;
16. ocean freight conditions where relevant and legally/licensed available;
17. equipment, parts, tire, service-shop, towing, and maintenance-network capacity indicators where available;
18. OEM recall/service bulletins and other authoritative maintenance disruptions where permitted;
19. insurance/claims and safety signals only where lawful, relevant, and approved;
20. customer/network-local historical operating signals, subject to privacy and data-sharing policy.

## 5. Canonical signal lifecycle

```text
RAW OBSERVATION
      ↓
VALIDATED SOURCE EVENT
      ↓
NORMALIZED MARKET OBSERVATION
      ↓
DERIVED INDICATOR
      ↓
FORECAST / INTERPRETATION (optional)
      ↓
CUSTOMER RELEVANCE ASSESSMENT
      ↓
CUSTOMER IMPACT BRIEF / ALERT
```

Raw facts, derived metrics, forecasts, and recommendations SHALL remain distinguishable.

## 6. Customer-specific relevance

FMI SHALL not deliver one generic national news feed to every customer.

Customer relevance may consider, only within approved scopes:

- participant type;
- active Operational Twin(s);
- enabled capabilities;
- operating geographies;
- lanes/corridors;
- equipment types;
- commodities/customer industries;
- facilities/ports/rail ramps served;
- service/maintenance network;
- current and planned WorkUnits;
- customer-declared operating strategy;
- risk tolerances and notification preferences.

Relevance logic may rank and explain signals but cannot silently alter approved Twin facts.

## 7. Example customer outcomes

### Carrier

- lane rate trend and capacity shifts;
- likely repositioning opportunity;
- produce/seasonal volume changes;
- fuel movement affecting trip economics;
- disruptions affecting ETA or service risk;
- market regime changes affecting dispatch strategy.

### Broker

- buy-side capacity tightness;
- sell/buy rate context;
- lane volatility;
- sourcing difficulty;
- tender/rejection changes;
- disruption and commodity-driven demand;
- margin-risk context.

### Facility

- inbound/outbound freight surge indicators;
- port/rail/border disruption spillover;
- expected appointment pressure;
- seasonal commodity volume;
- carrier-capacity constraints affecting arrivals.

### Shipper

- procurement/routing-guide risk;
- rate and capacity movement;
- service-risk corridors;
- mode-shift indicators;
- disruption exposure.

### Service Provider / RigDesk / Maintenance

- parts/service capacity disruptions;
- weather and road incident clusters;
- fuel and operating-cost changes;
- maintenance demand surges;
- OEM/service network alerts where authoritative and permitted.

## 8. Operational-twin boundary

FMI may **reference** approved Twin data to determine relevance. FMI cannot write new authoritative Twin facts merely because it inferred them.

Example:

> Frequent customer loads from Dallas to Atlanta may make Dallas→Atlanta rate intelligence highly relevant.

That does not authorize FMI to mutate the customer's approved lane strategy, rate floor, customer preference, dispatch policy, or operating authority.

## 9. Network effect

As FreightOS participation grows, network-derived intelligence may become more valuable, but network data must remain governed by:

- participant consent;
- purpose limitation;
- data classification;
- aggregation thresholds;
- anti-reidentification rules;
- commercial-confidentiality boundaries;
- source rights/licensing;
- provenance and correction.

No customer's confidential rate, load, counterparty, cost, or operational information becomes another participant's raw market feed merely because both use FreightOS.

## 10. Non-activation

This document does not authorize ingestion of paid/vendor feeds, scraping, news redistribution, customer cross-use, market-data resale, autonomous pricing, automated load acceptance, or external operational writes.
