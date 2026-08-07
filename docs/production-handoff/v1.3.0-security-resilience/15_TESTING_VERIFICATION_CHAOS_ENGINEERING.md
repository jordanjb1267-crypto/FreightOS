# 15 — Testing, Verification, and Chaos Engineering Standard

## 1. Testing philosophy

Tests must prove security and operational invariants, not merely code coverage. Production-critical claims require repeatable evidence.

## 2. Test layers

- unit tests for deterministic rules;
- property-based tests for parsers, policy, money, and event invariants;
- integration tests for databases, queues, storage, and identity;
- contract tests for every external integration;
- end-to-end tests for critical user journeys;
- adversarial security tests;
- migration and rollback tests;
- load, capacity, and resource-exhaustion tests;
- restore and reconciliation tests;
- agent evaluation suites;
- chaos and fault-injection exercises.

## 3. Security invariants

Examples:

- no cross-tenant read/write through any path;
- no authority from client-controlled identity fields;
- role revocation propagates within target;
- highly sensitive data never appears in logs;
- audit events cannot be edited by application roles;
- repeated idempotency key produces one business effect;
- unsigned artifact cannot deploy;
- agent cannot use unlisted tool or exceed limit;
- break-glass access alerts and expires;
- restored system preserves policies and isolation.

## 4. Chaos engineering rules

Chaos experiments must be bounded and begin outside production. Each experiment requires:

- hypothesis;
- steady-state indicator;
- maximum scope;
- abort conditions;
- rollback;
- observers;
- evidence capture;
- post-experiment review.

Priority experiments:

- terminate workers during event processing;
- delay or reorder messages;
- duplicate webhook deliveries;
- disable AI provider;
- disable maps/telematics/payment sandbox;
- saturate a tenant-specific queue;
- fail a database replica;
- make control plane unavailable while data plane continues;
- revoke credentials mid-session;
- restore a cell from backup;
- deploy a deliberately failing canary and verify rollback.

## 5. Production testing

Production tests must use isolated synthetic principals and prevent real dispatch, payment, messaging, or provider effects unless an explicitly approved live exercise requires them.

## 6. Defect closure

A severe defect is not closed until:

- root cause is understood;
- exploit/failure path is blocked;
- regression test fails on old version and passes on fixed version;
- related variants are reviewed;
- monitoring is improved;
- affected data/transactions are reconciled;
- user remediation is completed where applicable.

## 7. Independent verification

Before high-trust enterprise or network-wide activation, plan independent penetration testing and architecture review focused on tenancy, authority, payments, agent tools, integrations, and recovery. Compliance certification is not a substitute for technical testing.
