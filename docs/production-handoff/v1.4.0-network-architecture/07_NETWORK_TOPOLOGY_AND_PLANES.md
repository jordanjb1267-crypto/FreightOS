# 07 — Network Topology and Planes

## 1. Logical topology

FreightOS uses a hub-and-federation model:

- a shared network kernel provides identity, policy, schemas, discovery, routing, and audit;
- applications and partners connect through APIs, event channels, batch/EDI adapters, and controlled portals;
- authoritative business data may remain with the participant or designated domain service;
- FreightOS maintains sufficient references, policy, and replicated operational state to coordinate safely.

## 2. Governance plane

Contains:

- network constitution;
- schema and vocabulary registry;
- conformance levels;
- partner agreements;
- policy definitions;
- architecture decisions;
- deprecation calendar.

## 3. Control plane

Contains:

- identity federation;
- authorization and consent;
- participant registry;
- capability and endpoint registry;
- subscription registry;
- schema resolution;
- routing policy;
- key and credential metadata.

## 4. Data plane

Handles:

- event ingestion and delivery;
- API resource exchange;
- evidence/document transfer;
- query and subscription responses;
- partner acknowledgements.

## 5. Execution plane

Runs commands with side effects through isolated executors. Each executor has an allowlist, rate and amount limits, idempotency store, circuit breaker, audit emitter, and kill switch.

## 6. Observation plane

Correlates business and technical telemetry without exposing sensitive payloads. It measures event freshness, delivery lag, command success, reconciliation drift, workflow deadlines, authorization denials, and partner conformance.

## 7. Regional and cellular evolution

The initial implementation may be single-region and modular, but interfaces must not assume one database or one deployment cell. Network IDs, routing, schemas, and event envelopes must support later partitioning by region, tenant, and criticality.

## 8. Offline and edge operation

Driver, vehicle, facility, and roadside workflows require bounded offline behavior:

- signed cached assignments and permissions;
- local event queue;
- monotonic client sequence;
- secure reconciliation after reconnect;
- stale-policy expiration;
- conflict handling;
- no offline execution of prohibited financial or identity changes.
