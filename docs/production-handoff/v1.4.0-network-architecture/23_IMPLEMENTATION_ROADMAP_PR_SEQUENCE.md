# 23 — Implementation Roadmap and Pull-Request Sequence

## Governing rule

One pull request should introduce one reviewable capability with tests and rollback. Documentation installation remains separate from runtime implementation.

## Phase 0 — Inventory and gap analysis

### PR 0A — Network inventory document

- current domain models and identifiers;
- API/event/webhook inventory;
- tenant and authority boundaries;
- existing outbox/queue/workflow patterns;
- partner/standards integrations;
- data ownership and source-of-truth map;
- known live side effects.

No runtime change.

### PR 0B — Architecture decision baseline

Create ADRs for:

- canonical ID strategy;
- event envelope;
- schema registry;
- modular kernel boundaries;
- outbox/event durability;
- command/idempotency model;
- initial partner/pilot scope.

## Phase 1 — Contracts before transport

### PR 1 — Canonical identifiers and object references

Add immutable IDs, external alias model, relationship primitives, and tests. No destructive ID migration.

### PR 2 — Schema registry and contract validation

Install JSON Schema validation, registry metadata, versioning rules, and CI checks.

### PR 3 — Universal event envelope

Add event model, event catalog entries, validation, classification, correlation, correction, and tests.

### PR 4 — Transactional outbox

Guarantee state change and event publication intent are committed together. Add recovery and duplicate tests.

## Phase 2 — Event network

### PR 5 — Event ingestion and durable journal

Authenticated/authorized publication, append-only record, dedupe, audit.

### PR 6 — Subscription and projection policy

Field-level redaction, purpose/consent, subscription lifecycle.

### PR 7 — Delivery worker and receipts

Retry, backoff, webhook signatures, dead-letter, replay, lag telemetry.

### PR 8 — Reconciliation

Gap detection, checkpoints, replay authorization, divergent-state reports.

## Phase 3 — Commands and workflows

### PR 9 — Command envelope and idempotency store

Expected version, preconditions, expiry, approval, deterministic result.

### PR 10 — Bounded executor framework

Allowlist, limits, circuit breakers, side-effect adapters, kill switches.

### PR 11 — Workflow state machine framework

Timers, transitions, evidence, compensation, audit.

### PR 12 — Human approval service

Risk tiers, step-up, dual control where required, immutable approvals.

## Phase 4 — Evidence and interoperability

### PR 13 — Evidence/document registry

Hashes, lineage, classifications, transformations, access.

### PR 14 — Adapter framework

Anti-corruption boundary, mapping metadata, errors, conformance harness.

### PR 15 — First standards profile

Select one pilot profile—recommended GS1/EPCIS-aligned road event subset—and prove mapping and round-trip behavior.

### PR 16 — Partner sandbox and conformance portal

Synthetic data, contracts, replay, failure testing, reports.

## Phase 5 — First end-to-end network workflow

Recommended pilot: facility arrival/dwell/detention or roadside service coordination.

### PR 17 — Domain workflow

Canonical objects, events, commands, approvals, evidence, read model.

### PR 18 — Existing app adapters

RigReceipts/RigDesk/FreightOS application integration without breaking current workflows.

### PR 19 — Known partner pilot adapter

Sandbox first, then controlled production behind flags and limits.

### PR 20 — Outcome and reconciliation dashboard

User-visible state, delivery, exceptions, discrepancies, audit.

## Phase 6 — Agent proposal layer

### PR 21 — Agent identity and proposal envelope

Read-only proposal flow; no direct execution.

### PR 22 — Deterministic proposal gate

Policy, current state, authority, limits, approvals.

### PR 23 — Bounded low-risk automation

One reversible capability with canary, kill switch, audit, and post-action verification.

## Phase 7 — Network expansion

- capability discovery;
- service/provider exchange;
- settlement reconciliation;
- additional standards profiles;
- regional/cellular evolution;
- multimodal pilots.

## Cross-PR gates

Every runtime PR must include:

- backward compatibility analysis;
- tenant/authorization tests;
- event/schema contract tests;
- migration and rollback plan;
- observability and runbook updates;
- no unapproved live activation;
- evidence mapped to `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`.
