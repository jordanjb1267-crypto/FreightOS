# 07 — Event Delivery, Idempotency, and Reconciliation Standard

## 1. Principle

FreightOS must provide **exactly-once business effects**, not claim impossible universal exactly-once network delivery. Durable events may be delivered more than once; consumers must make repeated delivery safe.

## 2. Event envelope

Every consequential event MUST include:

- unique event ID;
- event type and schema version;
- producing principal/system;
- organization and cell scope;
- aggregate/resource ID;
- event occurrence time and receipt time;
- correlation and causation IDs;
- idempotency key where a command can create an external effect;
- classification and visibility metadata;
- integrity/provenance metadata;
- policy or authorization reference for commands;
- payload hash where appropriate.

## 3. Delivery controls

- durable storage before acknowledgement for critical events;
- transactional outbox or equivalent for database-to-bus consistency;
- consumer inbox/deduplication records;
- bounded retries with exponential backoff and jitter;
- dead-letter queues with ownership and alerts;
- poison-message isolation;
- schema compatibility checks;
- partitioning rules where ordering matters;
- replay controls and audit;
- backpressure and load shedding;
- retention sufficient for declared recovery and reconciliation needs.

## 4. Idempotency

Operations that dispatch service, create payments, change appointments, assign equipment, or notify external parties MUST accept or generate stable idempotency keys.

An idempotency record SHOULD capture:

- key and operation;
- requester and scope;
- normalized request hash;
- first receipt time;
- status;
- resulting resource/effect;
- response or error classification;
- expiration.

A repeated key with a materially different request must be rejected and alerted.

## 5. External connectors

Each connector MUST define:

- source-of-truth ownership;
- authentication and secret model;
- supported idempotency behavior;
- retry-safe and retry-unsafe operations;
- rate limits;
- timeout and circuit-breaker settings;
- webhook authenticity validation;
- ordering assumptions;
- reconciliation API or alternate evidence;
- degraded mode;
- kill switch.

Never blindly retry an external operation with financial, dispatch, appointment, or roadside consequences.

## 6. Reconciliation

Reconciliation is a first-class subsystem. For each material workflow compare:

- intended command;
- accepted command;
- internal state;
- external provider state;
- resulting events;
- settlement/document evidence;
- final resolved state.

Discrepancies create explicit reconciliation records with severity, owner, deadline, and resolution. The example schema is `schemas/reconciliation-record.schema.json`.

## 7. Event correction

Do not mutate history silently. Use:

- correction events;
- supersession links;
- reason codes;
- initiating principal;
- approval/evidence where required.

Consumers must be able to derive current state while preserving original history.

## 8. Required tests

- duplicate delivery does not duplicate business effect;
- crash after external acceptance but before internal commit is reconciled;
- crash after internal commit but before external request is safely retried;
- reordered events do not create invalid state;
- poison event does not block the partition indefinitely;
- replay cannot repeat irreversible effects;
- schema upgrade supports old producers/consumers during migration;
- connector outage queues or fails predictably;
- dead-letter records expose no unauthorized sensitive payloads.
