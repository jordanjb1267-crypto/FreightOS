# 16 — Commercial and Deployment Model

## Product architecture

```text
FreightOS Platform
├── Carrier Operations
├── Brokerage Operations
├── FacilityOS
├── Shipper Operations
├── Service/RigDesk Network
├── Capability Packs
└── Network / API / Integration services
```

Commercial packaging can differ without creating different code foundations.

## Deployment tiers

### Shared SaaS
SMB / standard customers.

### Dedicated execution partition
High-volume workloads with isolated worker/queue capacity.

### Dedicated cell
Enterprise/regulatory/customer-required isolation:
- DB
- queues
- keys
- workers
- region/residency.

### Private/partner deployment
Only when product/business/security model supports it; maintain canonical release train.

## Billing principles

Bill by customer value units where possible, not "AI tokens."

Potential units:
- active asset/fleet
- managed shipment
- broker transaction
- completed facility visit
- active facility
- service case
- integration/network volume
- enterprise platform commitment.

## Separate legal/commercial revenue

Keep:
- SaaS
- brokerage
- marketplace/exchange
- service fees
- financing/insurance
distinct where applicable.

## Licensing/entitlements

All sellable modules have versioned entitlements and activation gates.
Entitlement alone cannot bypass legal/policy gates.
