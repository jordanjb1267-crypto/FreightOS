# 17 — Enterprise Scale, Branch, and Book Architecture

## Same product

One broker:
```text
Brokerage Entity
└── one book
```

Large 3PL:
```text
Brokerage Enterprise
├── Legal Entity
│   ├── Division
│   │   ├── Branch
│   │   │   ├── Team
│   │   │   └── Book / Account Pod
```

## Scope

Policy/authority can inherit:
enterprise -> entity -> branch -> team -> account/workflow.

Overrides explicit/versioned.

## Partitioning

Use:
tenant + legal plane + branch/account/workflow.

Do not place the entire brokerage's carrier/shipper context in one model prompt.

## Dedicated cells

Large customers may require:
- dedicated DB/queues/workers
- encryption keys
- data residency
- network egress controls
- custom SLO.

Canonical contracts remain unchanged.

## Load

Test:
- RFQs/min
- quote concurrency
- carrier invitations
- tenders
- tracking events
- documents
- invoice/pay records
- transaction-record exports
- agent workflows
- branch isolation.

## Noisy neighbor

Per tenant:
- queue
- model budget
- integration concurrency
- storage
- rate limit
- carrier invitation policy.
