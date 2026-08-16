# 13 — Pricing, Discount, Quote, and Deal Desk

## Pricing architecture

Pricing should consume:

- SKU/version;
- quantity/value meter;
- term;
- deployment tier;
- implementation scope;
- support tier;
- approved partner economics;
- taxes/pass-throughs where appropriate;
- approved discount program.

## Deterministic core

Final arithmetic and authorization are deterministic. Models may recommend or explain but do not become the source of numeric authority.

## Discount control

Example authority hierarchy:

```text
standard seller → bounded discount
senior/enterprise seller → larger bounded discount
revenue leader/deal desk → exception band
executive/owner → extraordinary exception
```

Exact thresholds are owner/commercial decisions, not hard-coded by this package.

## Quote immutability

A quote version includes:

- quote ID/version;
- catalog version;
- pricing-rule version;
- customer/account;
- SKUs/capabilities;
- quantities/meters;
- term;
- discount and approval evidence;
- expiration;
- PromiseSet version;
- taxes/pass-through treatment;
- partner attribution.

Accepted quote terms are never silently mutated.

## ROI

ROI models must separate:

- customer-provided facts;
- verified observed facts;
- benchmark assumptions;
- scenario assumptions;
- estimated savings;
- guaranteed outcomes (normally none unless explicitly contractually approved).

A salesperson cannot present an estimate as guaranteed savings.
