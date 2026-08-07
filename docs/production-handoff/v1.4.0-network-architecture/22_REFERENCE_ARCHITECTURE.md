# 22 — Reference Architecture

## 1. Initial modular network kernel

Recommended bounded modules:

1. **Identity and Relationship Registry**
2. **Policy, Consent, and Delegation Engine**
3. **Canonical Object Registry and Resolver**
4. **Schema, Vocabulary, and Event Catalog**
5. **Event Ingestion and Durable Store**
6. **Subscription and Delivery Service**
7. **Command Gateway and Idempotent Executors**
8. **Workflow Orchestrator**
9. **Evidence and Document Registry**
10. **Capability and Endpoint Registry**
11. **Reconciliation Service**
12. **Audit and Network Observability**
13. **Standards/Partner Adapter Framework**
14. **Agent Proposal Gateway**

These can initially live in a modular monolith or limited services. Boundaries and contracts matter before deployment count.

## 2. Data stores

Use purpose-specific logical stores:

- transactional relational store;
- append-only event/audit store;
- object/evidence storage;
- search/read models;
- idempotency and delivery state;
- analytics warehouse/lake with governed ingestion;
- schema and policy registries.

Physical consolidation is allowed initially if access, lifecycle, migration, and blast-radius boundaries remain explicit.

## 3. Core flow

```text
Producer/Endpoint
  -> Gateway/Adapter
  -> Identity + Policy + Schema Validation
  -> Durable Event or Command Acceptance
  -> Event Store / Workflow / Executor
  -> Authorized Subscriptions and Read Models
  -> Delivery Receipts + Reconciliation
  -> Audit/Observability
```

## 4. Agent flow

```text
Event/Context
  -> Agent reads permitted projection
  -> Agent emits proposal
  -> Deterministic policy and state validation
  -> Human approval when required
  -> Command gateway
  -> Idempotent executor
  -> Result event and audit
```

## 5. Partner flow

```text
External Standard/API/EDI
  -> Partner-specific adapter
  -> Canonical mapping + semantic validation
  -> Network event/object/command
  -> response or outbound mapping
  -> conformance and reconciliation evidence
```

## 6. Deployment evolution

### Phase A

Modular kernel, one production region, managed infrastructure, no broad external execution.

### Phase B

Separated event delivery/execution workers, partner sandbox, bounded pilots, replay/reconciliation.

### Phase C

Cells/regions, workload identity federation, partner production integrations, capacity discovery.

### Phase D

Multimodal profiles, high-volume network services, regulated partnerships, autonomous bounded coordination.

## 7. Technology neutrality

The handoff does not mandate Kafka, a particular cloud, service mesh, graph database, or blockchain. Selection follows workload evidence, team capacity, security, total cost, and reversibility.
