# 18 — Implementation Roadmap and Pull-Request Sequence

## Phase 0 — Preserve and baseline

### PR 0.1 — Install governance package

- Add this handoff directory.
- Link it from the prior master handoff.
- Add document precedence and owners.
- No runtime changes.

**Gate:** repository clean, links valid, no existing governance removed.

### PR 0.2 — Current-state inventory

- Services, databases, queues, object stores, environments, integrations, secrets, roles, data classes, critical workflows.
- Produce current architecture and gap register.

**Gate:** all production-capable components have owners and risk tiers.

## Phase 1 — Identity and tenant isolation foundation

### PR 1.1 — Principal and membership invariants

- Distinct principal, organization, membership, role, permission, and grant models.
- Trusted server-side actor and tenant context.
- Deny-by-default policy.

### PR 1.2 — Authority-table lockdown

- Runtime roles cannot directly modify authority-bearing tables.
- Controlled administrative operations with pinned search paths and audit.
- Fabricated and borrowed identity tests.

### PR 1.3 — Cross-tenant isolation suite

- Database, service, storage, cache, search, export, and agent retrieval tests.
- CI blocker.

**Phase gate:** six or more varied unauthorized identities collapse to the same denied outcome; no runtime owner/superuser access.

## Phase 2 — Audit, data protection, and privacy

### PR 2.1 — Append-only audit plane

- Consequential action and authorization decision events.
- Isolated write path and retention.

### PR 2.2 — Data classification and redaction

- Classification metadata, redaction library, logging guardrails, telemetry tests.

### PR 2.3 — Retention/deletion engine

- Versioned retention policies, deletion records, index/cache propagation, reports.

**Phase gate:** sensitive-data leak tests pass; deletion and audit behavior proven.

## Phase 3 — Reliable event and integration substrate

### PR 3.1 — Canonical event envelope and schema registry

### PR 3.2 — Transactional outbox and consumer inbox/deduplication

### PR 3.3 — Dead-letter, replay, and reconciliation system

### PR 3.4 — Connector framework with kill switches, timeouts, circuit breakers, webhook validation, and idempotency policy

**Phase gate:** crash/retry/reorder tests produce one reconciled business effect.

## Phase 4 — Observability and reliability governance

### PR 4.1 — Criticality registry and default SLOs

### PR 4.2 — User-journey SLIs, dashboards, and burn-rate alerts

### PR 4.3 — Last-known-good and degraded-mode framework

### PR 4.4 — Synthetic cross-tenant and critical-path monitoring

**Phase gate:** each Class A/B service has SLO, runbook, owner, and tested degraded behavior.

## Phase 5 — Secure delivery and recovery

### PR 5.1 — Protected release pipeline, SBOM, provenance, signing, artifact verification

### PR 5.2 — Canary and automatic rollback for safe changes

### PR 5.3 — Migration expand/contract tooling and compatibility tests

### PR 5.4 — Immutable backups, automated restore validation, recovery runbooks

**Phase gate:** exact signed artifact promoted; canary rollback and full restore proven.

## Phase 6 — Agent and autonomous repair boundaries

### PR 6.1 — Agent registry and action envelope

### PR 6.2 — Tool allowlists, policy checks, limits, approvals, and kill switches

### PR 6.3 — Prompt-injection and cross-tenant evaluation harness

### PR 6.4 — Level 1 observation and recommendation

### PR 6.5 — Selected Level 2 bounded remediation runbooks

### PR 6.6 — Level 3 candidate-fix PR generation without merge/deploy authority

**Phase gate:** agent cannot exceed tool/data/transaction scope; remediation rollback and audit proven.

## Phase 7 — Cellular and regional resilience

### PR 7.1 — Tenant/cell placement abstraction and per-cell quotas

### PR 7.2 — Cell-isolated workers, queues, and deployment rings

### PR 7.3 — Warm-region recovery and failover exercise

### PR 7.4 — Selected active-active stateless services

**Phase gate:** failure of one test cell does not materially affect another; recovery and reconciliation meet measured objectives.

## Phase 8 — External assurance readiness

- independent penetration test;
- architecture review;
- incident tabletop and technical exercise;
- control/evidence mapping;
- remediation of findings;
- production-readiness review.

## Sequencing constraints

- Do not implement agent execution before identity, policy, audit, and idempotency foundations.
- Do not implement automatic broad remediation before rollback and observability are proven.
- Do not claim multi-region resilience before exercising it.
- Do not activate financial or dispatch side effects through connectors without reconciliation.
- Do not centralize all tenants into a single blast radius while describing the system as cellular.
