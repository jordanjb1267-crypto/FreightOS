# 01 — FreightOS Security, Privacy, and Resilience Constitution

## Article I — Trust is a product obligation

FreightOS SHALL earn trust through verifiable controls rather than claims. The platform MUST provide evidence of isolation, authorization, integrity, availability, recovery, and accountable operation.

No team may represent FreightOS as breach-proof, bug-free, or incapable of outage. The engineering promise is that failures are anticipated, contained, recoverable, and prevented from becoming network-wide operational events.

## Article II — Least privilege and explicit authorization

1. Every human, service, device, integration, workload, and agent MUST have a distinct identity.
2. Every consequential request MUST be authenticated and authorized at the resource and action level.
3. Permissions MUST be deny-by-default.
4. Administrative permissions MUST be separate from normal application permissions.
5. Production roles MUST NOT be granted directly to end-user-controlled sessions.
6. Sensitive actions MUST support step-up verification, dual control, cooling periods, or transaction limits as appropriate.
7. Authorization decisions MUST be logged with policy version and decision context.

## Article III — Tenant and counterparty confidentiality

1. Each protected object MUST carry authoritative ownership or tenancy metadata assigned by trusted server-side logic.
2. Cross-tenant sharing MUST be explicit, purpose-bound, and auditable.
3. A counterparty relationship does not grant general access to an organization's records.
4. Commercially sensitive information such as carrier margins, customer rates, internal notes, maintenance strategy, and payment instructions MUST be separately authorized.
5. Tenant isolation MUST be enforced in multiple layers, including database, service, cache, storage, search, analytics, and export paths.

## Article IV — Data minimization and privacy

1. FreightOS MUST maintain a data inventory and classification for every sensitive field and event.
2. Collection MUST have a documented business purpose.
3. Retention MUST be finite unless a legal, contractual, security, or operational requirement justifies continuation.
4. Nonproduction environments MUST use synthetic, anonymized, or strongly masked data.
5. Analytics and model training MUST use the minimum necessary data and respect customer agreements and consent.
6. High-risk identity, banking, and credential data SHOULD be tokenized or verified by a specialized provider instead of stored directly.

## Article V — Integrity and nonrepudiation

1. Consequential events MUST be attributable to a verified identity.
2. Event corrections MUST preserve the original event and append the correction.
3. The audit system MUST be logically and operationally isolated from normal application writes.
4. Payment, authority, chain-of-custody, and credential changes MUST include enhanced evidence and anomaly detection.
5. Documents used to authorize or settle transactions MUST support hashing, versioning, provenance, and access history.

## Article VI — Resilience and continuity

1. Every service MUST have a criticality class, service-level objectives, recovery time objective, recovery point objective, and defined degraded mode.
2. No optional external provider may be a silent single point of failure for a Class A workflow.
3. The platform MUST use bulkheads, timeouts, circuit breakers, queues, retries, and load shedding where appropriate.
4. Critical user operations MUST be able to continue or queue safely during partial failures.
5. Backups MUST be immutable where practicable and restored on a recurring schedule.
6. Regional, cellular, and dependency failures MUST be exercised before they are relied upon.

## Article VII — Safe software delivery

1. All production changes MUST originate in version control and pass protected review and automated validation.
2. Build artifacts MUST be signed and traceable to source, builder, dependencies, and test evidence.
3. Security defects MUST receive regression tests.
4. High-risk changes MUST be canaried or feature-flagged.
5. Database changes MUST be backward compatible through expand-and-contract migration patterns.
6. Automatic rollback MUST be available for application and configuration changes that meet rollback safety requirements.
7. Emergency changes MUST be documented and reviewed after stabilization.

## Article VIII — Autonomous systems

1. Models and agents are untrusted decision-support components unless a deterministic policy engine authorizes execution.
2. Prompt content MUST NOT grant permissions, alter policies, reveal secrets, or override safety constraints.
3. Agents MUST use narrowly scoped tools and credentials.
4. Agent actions MUST have amount, frequency, object, organization, and time boundaries.
5. High-impact actions require human approval or deterministic multi-party authorization.
6. Autonomous remediation is limited to pre-approved runbooks with bounded effects and tested rollback.
7. Agent and remediation systems require kill switches independent of the model being controlled.

## Article IX — Detection, response, and disclosure

1. FreightOS MUST monitor security, correctness, availability, and data-integrity signals.
2. Incidents MUST be classified by user, operational, data, financial, safety, and legal impact.
3. Containment MUST prioritize reducing harm while preserving evidence.
4. Customer communication MUST be accurate, timely, and proportionate to verified impact.
5. Significant incidents MUST produce a postmortem, permanent corrective actions, new tests, and updated monitoring.
6. No-blame review does not remove ownership for completing corrective actions.

## Article X — Non-regression

Security and reliability controls may not be removed merely to accelerate delivery. A temporary exception must:

- identify scope and affected controls;
- include compensating controls;
- define an owner and expiration date;
- document monitoring and rollback;
- receive approval at the risk level defined in the governance standard;
- automatically expire rather than remain indefinitely.
