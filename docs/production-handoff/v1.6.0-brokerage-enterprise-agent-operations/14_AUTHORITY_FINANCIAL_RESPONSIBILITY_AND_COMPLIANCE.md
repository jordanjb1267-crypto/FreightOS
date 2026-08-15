# 14 — Authority, Financial Responsibility, and Compliance

## Activation gate

Before live U.S. property brokerage:
- authorized brokerage entity;
- FMCSA broker authority;
- qualifying financial responsibility filing;
- process-agent filing;
- counsel-approved operating contracts/disclosures;
- recordkeeping;
- separate brokerage accounts/ledger;
- compliance ownership;
- authority/financial-responsibility monitoring;
- kill switches;
- incident/wind-down procedure.

## Financial responsibility

Current federal registration baseline requires $75,000 of financial security via BMC-84 surety bond or qualifying BMC-85 trust fund.

Effective January 16, 2026, FMCSA's updated financial-responsibility rules include tightened BMC-85 asset/trustee requirements and authority suspension where available financial security falls below $75,000 and is not replenished within seven calendar days.

## Authority-health state

```text
ACTIVE
WARNING
REPLENISHMENT_REQUIRED
SUSPENSION_PENDING
SUSPENDED
UNKNOWN
```

Only authoritative sources/verified filings can set legal status.

## Execution behavior

For new brokerage transactions:
- ACTIVE → eligible subject to all other policy.
- UNKNOWN / SUSPENDED → fail closed.
- WARNING / REPLENISHMENT_REQUIRED / SUSPENSION_PENDING → follow counsel-approved compliance policy; do not silently originate new exposure.

Active shipments during a compliance incident follow an explicit legal/operations runbook.

## Misrepresentation

Brokerage UI, emails, quotes and agents must represent the registered brokerage identity and cannot hold brokerage operations out as a carrier operation.

## Accounting separation

Brokerage revenues/expenses are distinguishable from other businesses.

## Household-goods warning

Household-goods brokerage has additional specific rules. It is a separate capability/legal pack and is disabled unless explicitly implemented and approved.

## Counsel gate

This document is architecture, not legal advice. Counsel approves:
- contracts
- authority model
- state/jurisdiction rules
- disclosure
- claims/payment practices
- record access
- automation boundaries.
