# 00 — Master Security and Resilience Handoff

## 1. Executive directive

FreightOS is not a conventional single-tenant application. It is intended to become a multi-party logistics coordination network that carries commercially sensitive, operationally critical, financial, identity, asset, facility, and shipment information. The platform must therefore be engineered as critical infrastructure even before it reaches critical-infrastructure scale.

Security and reliability are product capabilities. They are not optional infrastructure polish, a post-launch audit, or a compliance exercise.

## 2. Required outcomes

The implementation produced from this handoff MUST establish the following outcomes:

1. **Structural tenant isolation.** A missing application filter cannot expose another tenant's information.
2. **No implicit authority.** Human, service, device, integration, and agent actions require verified identity and explicit authorization.
3. **Bounded blast radius.** A compromised identity, integration, deployment, queue, region, or cell cannot compromise the entire network.
4. **Continuity of critical operations.** Dispatch, active shipment access, emergency service, chain-of-custody capture, and critical communication continue in a defined degraded mode when optional dependencies fail.
5. **No uncontrolled autonomous repair.** Automation may execute pre-approved containment and rollback actions, but code changes must pass normal production gates.
6. **Auditable action history.** Consequential operations are attributable, tamper-evident, and reconstructable.
7. **Safe change management.** Releases, migrations, policies, and integrations can be canaried, disabled, rolled back, and reconciled.
8. **Proven recovery.** Backups and recovery plans are tested through scheduled restore exercises.
9. **Measurable reliability.** User-visible service objectives and error budgets govern release velocity.
10. **Privacy by design.** FreightOS collects, shares, and retains only what is necessary for a defined purpose.

## 3. Precedence

When this package conflicts with a less restrictive implementation preference, this package controls. A change to a constitutional requirement requires:

- a written architecture decision record;
- a threat-model update;
- explicit approval by the designated security and platform owners;
- regression and adversarial tests;
- migration and rollback plans;
- owner approval for changes affecting network authority, cross-tenant access, financial execution, or safety-critical operations.

## 4. Architecture boundaries

FreightOS MUST separate the following planes:

- **Control plane:** identity configuration, policy, tenancy, schema registry, routing, feature control, administrative changes.
- **Operational data plane:** shipment, facility, vehicle, service, document, and settlement events required for active workflows.
- **Intelligence plane:** predictions, recommendations, embeddings, analytics, agent reasoning, and model-mediated workflows.
- **Audit plane:** append-only evidence of consequential actions and policy decisions.
- **Recovery plane:** immutable backups, restore tooling, verified infrastructure definitions, and emergency access controls.

The operational data plane MUST continue in a limited, last-known-good mode when the intelligence plane is unavailable. A control-plane outage MUST NOT automatically terminate already-authorized operational workflows.

## 5. Fail-closed versus fail-safe rules

FreightOS MUST distinguish authorization safety from operational continuity:

- **Fail closed:** identity verification, permissions, payment-destination changes, role grants, data exports, secret access, sensitive document access, agent tool escalation, destructive administration.
- **Fail safe/degraded:** display of already-authorized active assignments, offline capture of operational events, queued document upload, emergency contact and roadside request creation, local access to cached critical instructions.

No component may improvise this choice at runtime. Each workflow must declare its failure mode.

## 6. Production prohibitions

The following are prohibited:

- direct production changes from a developer laptop;
- shared application superuser credentials;
- production services connecting with database-owner privileges;
- tenant authorization based only on client-supplied identifiers;
- secrets in source code, images, logs, telemetry, prompts, or tickets;
- unrestricted production-data copies in development or test;
- destructive one-step database migrations without backward compatibility;
- AI-agent authority derived from prompt text;
- automatic deployment of AI-generated code without standard review and evidence gates;
- hidden correction or deletion of consequential audit events;
- release promotion when a critical service has exhausted its error budget without an approved emergency exception.

## 7. Required deliverables before general availability

The system is not ready for general availability until the acceptance evidence in `19_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md` is complete, including:

- tenant-isolation proofs;
- zero-trust authorization tests;
- signed and reproducible build evidence;
- dependency inventory and SBOM;
- restore-drill evidence;
- regional or cell-failure exercise;
- event replay and reconciliation tests;
- incident-response exercise;
- critical-service SLO dashboards and alerts;
- agent boundary and prompt-injection tests;
- production rollback proof;
- data inventory and retention enforcement.

## 8. Implementation rule

Do not attempt to implement this package as one large pull request. Follow the ordered sequence in `18_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md`. Each pull request must leave the repository releasable, preserve prior behavior unless explicitly migrated, and include objective evidence.
