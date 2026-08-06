# 16 — Vendor and Integration Security Standard

## 1. Principle

Every connected TMS, ELD, OEM, mapping, payment, notification, OCR, storage, AI, facility, provider, or government system expands FreightOS's attack and failure surface.

## 2. Vendor tiers

- **V0 — Noncritical/public:** no sensitive data or operational dependency.
- **V1 — Business support:** limited internal or low-risk data.
- **V2 — Sensitive:** confidential data or customer-visible workflow.
- **V3 — Critical:** identity, payment, active operations, chain of custody, highly sensitive data, or Class A dependency.

V3 vendors require deeper security, resilience, exit, and incident review.

## 3. Due diligence

Assess as applicable:

- security program and independent assurance;
- encryption and key practices;
- identity, MFA, and administrative access;
- data locations, subprocessors, retention, and deletion;
- incident notification obligations;
- availability history and architecture;
- backup and disaster recovery;
- API authentication, rate limiting, idempotency, and webhook validation;
- software supply-chain practices;
- AI data use and training terms;
- portability and exit plan;
- contractual liability and audit rights.

## 4. Integration architecture

- isolate connectors in separate workers or accounts when practical;
- assign unique credentials per integration/environment;
- scope credentials to minimum permissions;
- store secrets in managed secret systems;
- validate webhook signatures and freshness;
- allowlist intended endpoints and defend against SSRF;
- enforce timeouts, rate limits, circuit breakers, and queues;
- record request/response metadata without leaking payload secrets;
- provide a connector kill switch;
- reconcile external state.

## 5. Vendor outage and compromise

Each V2/V3 integration requires:

- degraded mode;
- customer-visible freshness/status behavior;
- credential revocation plan;
- alternate provider or manual process where required;
- data-export and migration plan;
- incident contact and escalation;
- reconciliation after recovery.

## 6. AI/model providers

Contracts and architecture should address:

- whether prompts and outputs are retained or used for training;
- regional processing;
- model/version changes;
- logging and support access;
- security incident notice;
- availability and rate limits;
- content isolation;
- fallback or deterministic operation;
- ability to disable a provider without stopping core logistics workflows.

## 7. Continuous review

Inventory integrations automatically where possible. Alert on new external endpoints, credentials, packages, OAuth grants, or subprocessors that bypass review.
