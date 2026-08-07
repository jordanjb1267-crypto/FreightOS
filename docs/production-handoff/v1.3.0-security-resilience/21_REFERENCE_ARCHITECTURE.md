# 21 — FreightOS Security and Resilience Reference Architecture

## 1. Logical architecture

```mermaid
flowchart TB
  subgraph Participants
    H[Humans]
    D[Devices / Vehicles]
    X[External Systems]
    A[AI Agents]
  end

  subgraph Edge
    G[API / Event Gateway]
    W[Webhook Intake]
    U[User Applications]
  end

  subgraph TrustPlane[Identity and Trust Plane]
    I[Identity Provider]
    P[Policy Decision Service]
    K[Key and Secret Management]
    R[Risk / Step-up Engine]
  end

  subgraph ControlPlane[Global Control Plane]
    T[Tenant and Cell Registry]
    S[Schema Registry]
    C[Signed Configuration / Feature Control]
    AR[Agent Registry]
  end

  subgraph CellA[Operational Cell A]
    SA[Application Services]
    DA[(Operational DB)]
    QA[Durable Event Bus]
    OA[Outbox / Inbox]
    CA[Cache / Search]
    IA[Integration Workers]
  end

  subgraph CellB[Operational Cell B]
    SB[Application Services]
    DB[(Operational DB)]
    QB[Durable Event Bus]
    OB[Outbox / Inbox]
    CB[Cache / Search]
    IB[Integration Workers]
  end

  subgraph Intelligence[Intelligence Plane]
    M[Models]
    AG[Agent Orchestrator]
    V[Validation and Action Envelope]
  end

  subgraph Assurance[Audit and Assurance Plane]
    AU[(Append-only Audit)]
    O[Metrics / Logs / Traces]
    RC[Reconciliation]
    SI[Security Detection]
  end

  subgraph Recovery[Recovery Plane]
    BK[(Immutable Backups)]
    LG[Last-known-good Artifacts / Config]
    DR[Restore and Failover Automation]
  end

  H --> U --> G
  D --> G
  X --> W
  A --> V
  G --> I
  W --> I
  I --> P
  P --> R
  K --> I
  T --> G
  C --> CellA
  C --> CellB
  S --> QA
  S --> QB
  AR --> V
  G --> SA
  G --> SB
  SA --> DA
  SB --> DB
  SA --> OA --> QA
  SB --> OB --> QB
  QA --> IA
  QB --> IB
  QA --> Intelligence
  QB --> Intelligence
  M --> AG --> V --> P
  SA --> AU
  SB --> AU
  P --> AU
  IA --> AU
  IB --> AU
  CellA --> O
  CellB --> O
  O --> SI
  QA --> RC
  QB --> RC
  IA --> RC
  IB --> RC
  DA --> BK
  DB --> BK
  C --> LG
  LG --> DR
  BK --> DR
```

## 2. Trust boundaries

- Participant devices and external systems are untrusted.
- Gateway authentication does not replace resource authorization.
- Control-plane configuration must be signed/versioned and cached as last-known-good.
- Cells are independent blast-radius boundaries.
- Intelligence is advisory until the policy service authorizes an action envelope.
- Audit writes are separated from application data mutation.
- Recovery credentials and backups are isolated from normal production compromise paths.

## 3. Data-flow principles

- Canonical events carry scope, classification, provenance, and schema version.
- Cross-party sharing uses views/assertions rather than full object copies where possible.
- External side effects flow through connector workers with idempotency and reconciliation.
- Critical operational reads do not synchronously require AI or analytics.
- Global services should avoid synchronous per-transaction dependencies when a signed cached policy/configuration can safely suffice.

## 4. Suggested implementation technologies

Technology selection remains repository-specific. Required properties matter more than brands:

- managed identity with MFA and workload identity;
- policy-as-code or equivalent deterministic authorization;
- relational policy enforcement for tenant data;
- durable event streaming/queues;
- transactional outbox/inbox;
- managed secrets and keys;
- immutable artifact registry and signed provenance;
- OpenTelemetry-compatible tracing/metrics/logging where appropriate;
- immutable/cross-region backups;
- infrastructure as code;
- controlled feature flags and deployment rings.

## 5. Design warning

Do not turn the global control plane into a synchronous universal dependency. If every operational request requires a healthy global service, the architecture recreates a network-wide single point of failure.
