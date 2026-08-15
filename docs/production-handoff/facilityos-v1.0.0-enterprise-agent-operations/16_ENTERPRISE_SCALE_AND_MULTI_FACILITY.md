# 16 — Enterprise Scale and Multi-Facility Architecture

## Same logical product

Small site:
```text
Site
├── Shipping
├── Receiving
├── Gate
└── 4 docks
```

Enterprise:
```text
Enterprise
├── Region
│   ├── Campus
│   │   ├── Buildings
│   │   ├── Gates
│   │   ├── Yards
│   │   └── hundreds of docks
└── thousands of sites
```

Same canonical objects.

## Site/network hierarchy

Enterprise -> legal entity -> business unit -> region -> campus -> site -> building/zone -> gate/yard/dock.

## Deployment

- shared cell
- dedicated execution partition
- dedicated enterprise cell.

## Partition

Use:
tenant + site/region + workflow/visit.

Do not coordinate an entire global facility network through one model context.

## Policy inheritance

Enterprise default
→ region override
→ site override
→ workflow-specific rule

Every override is explicit/provenanced.

## Network operations

Central enterprise control can view permitted:
- throughput
- capacity
- appointment health
- dwell
- exceptions
- facility health.

Local command authority remains scoped.

## Scale evidence

Test declared tiers:
- sites
- visits/day
- appointment events/sec
- documents/day
- EPCIS/EDI events
- concurrent mobile driver sessions
- dock updates
- exception burst.

No scale marketing claim without measured test evidence.
