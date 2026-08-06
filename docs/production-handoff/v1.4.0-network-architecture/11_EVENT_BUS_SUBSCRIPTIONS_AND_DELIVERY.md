# 11 — Event Bus, Subscriptions, and Delivery Guarantees

## 1. Logical bus

The logical network event bus is independent of any specific broker technology. Implementation may evolve from a managed queue/broker to partitioned streaming infrastructure without changing the public event contract.

## 2. Publication pipeline

1. authenticate producer;
2. resolve represented organization;
3. authorize event type and subjects;
4. validate schema and classification;
5. check idempotency/deduplication;
6. persist durable event and audit record;
7. acknowledge publication;
8. route to authorized subscriptions;
9. record delivery attempts and receipts;
10. reconcile gaps.

## 3. Subscriptions

A subscription defines:

- subscriber identity;
- event types and filters;
- subject/resource scope;
- purpose and consent basis;
- delivery channel;
- payload projection/redaction;
- version support;
- start position and retention window;
- retry/dead-letter policy;
- expiry and revocation.

## 4. Backpressure

Slow consumers may not degrade publishers or unrelated consumers. Apply bounded queues, delivery pause, lag alerts, catch-up policies, and controlled replay.

## 5. Reconciliation

Publishers and consumers expose sequence/checkpoint material where available. Reconciliation identifies:

- missing events;
- duplicates;
- unauthorized events;
- schema failures;
- late events;
- divergent aggregate state;
- delivery acknowledgements without processing completion.

## 6. Privacy

Routing decisions evaluate field-level projection and classification. A subscriber authorized for an event type may still receive a reduced payload.

## 7. Retention

Retention differs by event class, legal/evidence need, and consumer recovery requirement. Long-term analytical copies must preserve classification and correction lineage.
