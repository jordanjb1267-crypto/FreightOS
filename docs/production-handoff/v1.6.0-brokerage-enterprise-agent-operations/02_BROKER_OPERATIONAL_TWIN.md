# 02 — Broker Operational Twin (BOT)

## Purpose

The BOT is the brokerage customer's inspectable configuration of how the business operates.

## Domains

### Legal/business topology
- brokerage legal entity
- authority IDs/status sources
- branches
- divisions
- teams
- agent offices
- books of business
- modes/commodities
- geographic scope.

### Shipper accounts
- account identity
- contracts
- lane/equipment requirements
- routing guide
- tender rules
- service commitments
- pricing model
- accessorial rules
- credit/payment terms
- communication/escalation.

### Carrier network
- carrier identity/authority
- approved/prohibited status
- onboarding/evidence
- equipment/capability
- lanes/regions
- historical service
- insurance/credential metadata where applicable
- payment terms
- relationship status.

### Brokerage policy
- quote approval thresholds
- margin floors/targets
- carrier buy bounds
- max exposure
- credit rules
- carrier qualification
- high-value/hazmat/special cargo controls
- exception escalation
- claims rules.

### Systems
- TMS
- CRM
- load boards
- email/SMS/voice
- carrier onboarding
- public authority sources
- accounting
- factoring/payments
- document systems
- BI/analytics.

For each, define system-of-record ownership and read/write authority.

### SOPs
- RFQ intake
- quote
- coverage
- negotiation
- tender
- tracking
- check calls
- appointment
- accessorial
- claims
- billing
- carrier pay
- close.

## BOT assertion state

`PROPOSED | VERIFIED | APPROVED | DISPUTED | DEPRECATED`

A proposed shipper rate rule, carrier eligibility rule, or authority fact cannot authorize execution.

## Customer-visible diff

A BOT change must expose impact on:
- quotes;
- carrier pool;
- margins;
- active workflows;
- autonomy grants;
- contracts;
- integrations;
- records/retention.

## Drift

Drift examples:
- human brokers continually override agent buy rate;
- shipper requirements changed;
- carrier approval process changed;
- branch ownership changed;
- contract amended;
- integration schema changed.

Drift creates review; it does not silently mutate policy.
