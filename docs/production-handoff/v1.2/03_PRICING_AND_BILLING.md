# Pricing and Billing Specification

## Principles

FreightOS charges for active operating capacity, autonomy, completed transport operations, specialized workflows, integrations, enterprise infrastructure, and regulated transaction services.

It does not require per-user pricing, bill all stored trailers, or expose raw AI-token costs.

## v1.2 commercial activation status

The tables in this document include both initial launch targets and future planning targets.

### Initial launch-catalog implementation

- FreightOS Core
- FreightOS Copilot
- Standard implementation
- Approved integrations/API/MCP access
- Support plans

These products may be implemented during Horizon 1. Billing remains disabled until the Horizon 1 production-release gate is satisfied.

### Pre-launch target catalogs

- FreightOS Autonomous
- Shipper Control Tower
- Digital Brokerage
- Autonomous Freight Exchange
- FacilityOS products
- Autonomous Vehicle Link and Operations Center
- Rail, ocean, multimodal, and air products

For every pre-launch product:

```text
COMMERCIAL_STATUS = PRE_LAUNCH_TARGET
BILLING_ENABLED = FALSE
CUSTOMER_SALE_ALLOWED = FALSE
```

Future prices remain strategic hypotheses until their implementation, legal, customer, partner, safety, or liquidity gates pass. They must not be exposed in active checkout, public generally-available pricing, entitlement activation, or production invoices.


## Carrier plans

| Active powered units | Platform fee | Core/unit | Copilot/unit | Autonomous/unit |
|---:|---:|---:|---:|---:|
| 1–4 | $0 | $59 | $149 | $249 |
| 5–49 | $299 | $29 | $89 | $159 |
| 50–249 | $1,500 | $18 | $59 | $109 |
| 250–999 | $5,000 | $12 | $39 | $74 |
| 1,000–4,999 | $15,000 | $8 | $24 | $46 |
| 5,000–24,999 | $50,000 | $5 | $14 | $26 |
| 25,000–99,999 | $125,000 | $3 | $8 | $15 |
| 100,000+ | $250,000 | $2 | $4 | $8 |

All figures are target list prices and must be configurable, versioned, and contract-overridable.

## Active powered unit

An asset is billable when it is available, optimized, assigned, tracked, or operated through FreightOS. Enterprise quantity is the greater of the contracted minimum or monthly average daily active powered units. Archived/inactive assets are not billed.

## Autonomous operation allowance

Autonomous includes 15 standard FTL A4 transport operations per active powered unit per month.

| Unit band | Per overage operation |
|---:|---:|
| 1–49 | $6.00 |
| 50–249 | $4.00 |
| 250–999 | $2.50 |
| 1,000–4,999 | $1.50 |
| 5,000–24,999 | $0.75 |
| 25,000+ | $0.20–$0.60 contracted |

## High-frequency operations

### LTL consignments

- First 5,000: $1.50
- 5,001–50,000: $0.75
- 50,001–500,000: $0.30
- 500,001+: $0.08–$0.20

### Final-mile stops

- First 10,000: $0.40
- 10,001–100,000: $0.20
- 100,001–1,000,000: $0.08
- 1,000,001+: $0.02–$0.06

## Specialized packs

| Pack | Target price |
|---|---:|
| Cold chain | $12/active refrigerated unit/month |
| Advanced hazmat | $20/applicable active unit/month |
| Oversize/heavy haul | $15/applicable active unit/month |
| Bulk | $15/applicable active unit/month |
| Intermodal drayage | $10/active powered unit/month |
| Auto transport | $10/applicable active unit/month |
| High-value security | $15/applicable active unit/month |
| Trailer/container telematics | $1–$5/monitored unit/month |
| Predictive maintenance | $5–$12/active powered unit/month |

Activation, not equipment naming, triggers billing.

## Shipper plans

| Plan | Platform/month | Included orders | Overage |
|---|---:|---:|---:|
| Essentials | $499 | 100 | $5.00 |
| Growth | $2,500 | 1,000 | $2.50 |
| Enterprise | $10,000 | 10,000 | $1.00 |
| Strategic | $50,000 | 100,000 | $0.35 |
| Global | $150,000+ | Contracted | $0.10–$0.30 |

## Brokerage

Provisional targets pending counsel:

- Under $100,000 monthly spend: greater of $125/shipment or 10%
- $100,000–$999,999: greater of $95/shipment or 7%
- $1 million–$9.99 million: greater of $75/shipment or 5%
- $10 million+: 2.5%–4% contracted

## Exchange

- Subscriber carrier: no carrier fee; shipper 2.5%, $35 minimum
- Non-subscriber carrier: shipper 2.5%; carrier 0.5% capped at $25
- Enterprise: shipper 0.75%–1.5% contracted

## APIs and MCP

- Developer Sandbox: free
- Integration Pro: $499/month
- Integration Business: $2,500/month
- Integration Enterprise: $10,000+/month
- OEM/Embedded: custom

Underlying transaction meters still apply.

## Implementation

- 1–4 units: self-service
- 5–49: $2,500
- 50–249: $15,000
- 250–999: $50,000–$150,000
- 1,000–4,999: $250,000–$750,000
- 5,000–24,999: $750,000–$2 million
- 25,000–99,999: $2 million–$5 million
- 100,000+: $5 million+ SOW

## Billing entities

Product, ProductVersion, Plan, PriceCatalog, PriceCatalogVersion, Entitlement, Meter, MeterEvent, UsageAggregate, VolumeBand, Commitment, ContractOverride, Discount, Credit, BillingAccount, Invoice, InvoiceLine, RevenueCategory, TaxTreatment.

## Controls

- Activated catalogs are immutable.
- Contracts pin catalog and override versions.
- Meter events are idempotent.
- Corrections append adjustment events.
- Agents cannot alter price or discount.
- SaaS and brokerage billing remain separate.
- Customers see metered usage before invoice close.
