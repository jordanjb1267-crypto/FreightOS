# 14 — Attribution, Commission, and Payout Ledger

## Principle

Commission is an auditable financial calculation, not a mutable CRM opinion.

## Event chain

```text
Lead source
 → Account identity
 → Deal registration
 → Opportunity contributors
 → Commercial agreement
 → Invoice/receivable
 → Cash collection
 → Eligibility event
 → Commission calculation
 → Vesting/hold
 → Approval
 → Payout
 → Correction/clawback if contractually valid
```

## Recommended commission base

A configurable definition such as:

```text
Eligible Revenue =
  qualifying cash collected
  - refunds
  - credits
  - excluded taxes
  - excluded pass-through costs
```

Program-specific terms may differ, but the formula must be versioned and deterministic.

## Commission plan

Each plan records:

- plan ID/version;
- eligible relationship classes;
- eligible SKUs/revenue types;
- rates/tiers/accelerators;
- split rules;
- expansion/residual treatment;
- collection/vesting trigger;
- refund/clawback rules;
- dispute window;
- effective dates;
- approval.

## Attribution

Possible roles:

- source/referrer;
- opportunity owner;
- closer;
- solution advisor;
- partner;
- expansion owner.

A revenue event may split credit under a versioned rule. Percentages must sum deterministically and reject invalid combinations.

## Clawbacks/corrections

Only contractually defined events can create negative adjustments. Never rewrite the original earning event; append a correction linked to it.

## No direct payout authority

RevenueOS calculation may produce a payable recommendation. Actual money movement follows finance/payment authorization controls outside model discretion.

## Disputes

Disputes freeze only the contested portion where practical and preserve all source evidence. Resolver must be independent from the sole beneficiary of the override.
