# 53 — System-of-Record Binding and Synchronization Standard

## Purpose

An Operational Twin must integrate with the customer's current software without creating ambiguous truth or unsafe bidirectional loops.

## Required binding model

Every material object/field family SHALL declare a binding containing at minimum:

- participant/tenant;
- external system identity and adapter version;
- canonical FreightOS object/field;
- external object/field;
- external identifier mapping;
- authority mode;
- sync direction;
- freshness/SLA;
- conflict rule;
- write permission;
- idempotency strategy;
- ordering/version strategy;
- deletion/tombstone behavior;
- reconciliation method;
- classification/disclosure restrictions;
- effective interval;
- owner and kill switch.

## Authority modes

- `EXTERNAL_AUTHORITATIVE` — external system owns the business fact; FreightOS mirrors/uses it.
- `FREIGHTOS_AUTHORITATIVE` — FreightOS owns the business fact and may project/write it to integrations when authorized.
- `CUSTOMER_CONFIG_AUTHORITATIVE` — approved Twin configuration owns the rule/policy.
- `NETWORK_ASSERTED` — counterparty/network assertion is evidence, not automatically local truth.
- `DERIVED` — computed from authoritative inputs; must retain lineage/version.
- `HUMAN_ASSERTED` — authorized human assertion with provenance; subject to declared verification rules.

`BIDIRECTIONAL` is a transport direction, **not** an authority mode.

## Sync directions

- `PULL_ONLY`
- `PUSH_ONLY`
- `BIDIRECTIONAL_GOVERNED`
- `EVENT_SUBSCRIPTION`
- `MANUAL_IMPORT`
- `NO_SYNC_REFERENCE_ONLY`

## Inbound synchronization

```text
external event/snapshot
→ authenticate source
→ dedupe/order/version
→ map to canonical semantics
→ evaluate declared authority binding
→ detect conflict/staleness
→ record observation/evidence
→ update governed Twin projection if allowed
→ emit impacted-workflow invalidation/re-evaluation
```

## Outbound/writeback

```text
approved local business change
→ current binding/authority check
→ adapter command
→ idempotency key
→ external result
→ read-after-write or equivalent reconciliation
→ authoritative status update
```

A timeout after a potentially successful external write is `UNKNOWN`, not failure. Reconcile before retry.

## Loop prevention

Every adapter path must prevent event echo/feedback loops through stable correlation/causation IDs, source/version markers, idempotency keys, and semantic comparison where needed.

## Conflict doctrine

Conflicts SHALL be explicit states, not last-writer-wins by accident. Permitted strategies include:

- authoritative-source wins;
- version/sequence wins where contractually valid;
- human review;
- relationship-specific rule;
- merge for non-exclusive fields;
- HOLD when truth cannot be established.

## Adapter doctrine

Adapters translate. They do not own participant business policy. Customer-specific differences belong in versioned mappings/configuration/Twin policy, not code forks inside connectors.
