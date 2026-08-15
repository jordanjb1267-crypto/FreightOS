# 04 — Brokerage Workflow Graph Standard

## Mandatory graph families

- brokerage customer onboarding / BOT
- shipper RFQ/intake
- shipper quoting
- shipper commitment
- carrier sourcing
- carrier qualification
- carrier negotiation
- allocation
- tender/booking
- shipment execution
- tracking/communication
- facility/appointment coordination
- document/POD
- accessorial
- exception
- claims evidence
- shipper invoicing
- carrier payment/reconciliation
- transaction-record close
- authority/financial-responsibility incident.

## Canonical pattern

```text
Trigger
 ↓
Load authoritative legal/tenant state
 ↓
Load BOT + contract/policy
 ↓
Interpret/rank/plan
 ↓
Deterministic commercial + eligibility gates
 ↓
Approval/autonomy
 ↓
Idempotency
 ↓
External side effect
 ↓
External acknowledgement
 ↓
Event/evidence
 ↓
Reconciliation
 ↓
Next node/terminal
```

## Node classes

- deterministic
- intelligence
- human interrupt
- external side effect
- verification/reconciliation.

## Graph requirements

Every graph declares:
- state schema;
- terminal states;
- deadlines;
- retries;
- approval expiry;
- compensation;
- degraded mode;
- evidence;
- evaluation.

## Mutation tests

CI must fail if:
- carrier assignment bypasses brokerage authority;
- unqualified carrier can be tendered;
- margin policy can be bypassed by model;
- shipper quote can be sent outside limits;
- side effect lacks idempotency;
- transaction close omits required record fields;
- carrier-agent plane can allocate unrelated carriers;
- broker agent can represent itself as carrier;
- financial-responsibility hold can be ignored.
