# 02 — Security Governance and Risk Ownership

## 1. Objective

Establish accountable ownership for security, privacy, reliability, incident response, data governance, and agent authority. Tools do not own risk; named people and roles do.

## 2. Required roles

During the founder-led stage, one person may hold multiple roles, but responsibilities must remain distinct in records and approvals.

| Role | Required accountability |
|---|---|
| Executive Risk Owner | Accepts material business risk and approves constitutional changes |
| Security Owner | Security architecture, threat modeling, vulnerability management, incident command |
| Privacy/Data Governance Owner | Data inventory, classification, consent, retention, deletion, data-use approvals |
| Platform Reliability Owner | SLOs, error budgets, capacity, disaster recovery, production readiness |
| Identity and Authorization Owner | Identity lifecycle, policies, privileged access, authority-table integrity |
| Product Domain Owner | Correctness and degraded behavior for each logistics workflow |
| AI/Agent Safety Owner | Tool scope, agent authority, model-risk tests, kill switches |
| Incident Commander | Coordinates severe incidents independently of implementation teams |
| Evidence Custodian | Preserves audit, forensic, release, and recovery evidence |

## 3. Risk classification

Changes and incidents are classified by the maximum plausible impact:

- **R0 — Routine:** No sensitive data, authority, money, active operations, or external integration impact.
- **R1 — Controlled:** Limited noncritical workflow or internal data impact.
- **R2 — Significant:** Sensitive data, customer-visible degradation, third-party integration, or recoverable operational impact.
- **R3 — Critical:** Cross-tenant risk, identity/authorization, payments, active dispatch, chain of custody, safety-adjacent operation, destructive migration, broad outage, or agent execution authority.
- **R4 — Existential:** Network-wide compromise, systemic confidential-data exposure, unrecoverable data loss, widespread fraudulent execution, or inability to trust system history.

R3 and R4 changes require independent review and owner approval. R4 risk acceptance is not delegated.

## 4. Mandatory governance artifacts

Maintain the following in version control or a controlled evidence system:

- security and privacy risk register;
- system and data-flow diagrams;
- asset and service inventory;
- data-processing inventory;
- threat models;
- architecture decision records;
- exception register with expirations;
- vendor inventory and risk tier;
- incident register;
- SLO and error-budget history;
- backup and restore evidence;
- access-review evidence;
- release provenance and SBOMs;
- agent/tool authority registry.

## 5. Review cadence

- Critical access and role assignments: monthly during early production; quarterly after mature automation and evidence.
- Vendor and integration inventory: quarterly and upon material change.
- Threat models: at design, before GA, after significant architecture change, and after relevant incidents.
- Restore drills: at least quarterly for Class A/B data; monthly automated restore validation is preferred.
- Incident simulation: twice yearly minimum; quarterly once active network coordination is material.
- Constitutional review: annually, but updates may occur sooner as standards or risk change.
- Agent authority review: before enablement and at least quarterly.

## 6. Exceptions

Every exception record MUST include:

- control being bypassed;
- reason;
- risk statement;
- affected systems and tenants;
- compensating controls;
- detection method;
- rollback or remediation plan;
- owner;
- approver;
- creation date;
- hard expiration date.

Expired exceptions automatically become release blockers.

## 7. Security escalation rule

Any engineer, agent, operator, or reviewer may stop a release or disable a capability when there is credible risk of cross-tenant exposure, unauthorized authority, unrecoverable corruption, unsafe automated action, or material interruption of critical logistics operations. Resumption requires recorded evidence, not verbal assurance.
