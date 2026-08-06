# 03 — Zero-Trust Identity and Authorization Architecture

## 1. Scope

This standard applies to humans, services, workloads, devices, vehicles, integrations, API clients, and AI agents.

## 2. Identity hierarchy

FreightOS MUST model identities separately from organizations and roles:

- **Principal:** human, service, workload, device, integration, or agent.
- **Organization:** legal or operational entity.
- **Membership:** time-bounded relationship between a principal and an organization.
- **Role:** named collection of permitted operations.
- **Grant:** assignment of role or individual permission through trusted administration.
- **Context:** device posture, location, risk, transaction value, resource relationship, and session assurance.
- **Delegation:** explicitly bounded authority granted by one authorized principal to another.

A user-controlled `actor_id`, organization ID, header, token claim, or session variable MUST NOT independently create authority.

## 3. Authentication

- Use phishing-resistant MFA for privileged and high-impact users where supported.
- Require MFA for production administration, role management, bank-account change, high-value execution, and security configuration.
- Sessions must be revocable and short-lived according to risk.
- Service-to-service identity must use workload identity or short-lived credentials rather than static shared API keys where practical.
- Device and integration credentials must be individually identifiable and revocable.
- Account recovery must not be weaker than normal authentication for the recovered authority.

## 4. Authorization

Authorization SHOULD combine role-based and attribute-based control:

```text
ALLOW only when:
  principal identity is verified
  AND membership is active
  AND requested operation is explicitly allowed
  AND resource relationship is valid
  AND tenant/counterparty scope permits access
  AND contextual risk is acceptable
  AND required approval state is satisfied
```

Authorization policy must be evaluated server-side. Client interfaces may hide unavailable actions but are not security boundaries.

## 5. Privileged access

- Production administration must use separate privileged identities.
- Standing super-administrator access is prohibited for normal work.
- Use just-in-time elevation with reason, scope, duration, and audit.
- Break-glass access must require strong authentication, generate immediate alerts, and be reviewed after use.
- Database-owner and schema-owner roles must be `NOLOGIN` or otherwise unavailable to application sessions.
- Authority-bearing tables must reject direct writes from ordinary application roles.
- Privileged actions should require four-eyes approval for R3/R4 operations.

## 6. Step-up and transaction authorization

The following actions require stronger controls than ordinary login:

- changing payment destination;
- adding or changing an organization owner;
- modifying authority policies or roles;
- large or unusual financial approvals;
- exporting sensitive data;
- disabling security controls;
- granting an agent new tools or a higher limit;
- altering immutable/audit retention;
- deleting an organization or material history;
- overriding chain-of-custody conflicts.

Controls may include reauthentication, hardware-backed MFA, dual approval, cooling periods, verified out-of-band confirmation, or transaction signing.

## 7. Authorization decision records

Record:

- principal and organization;
- action and resource;
- policy identifier/version;
- decision and reason code;
- contextual attributes used;
- approval reference;
- correlation and trace identifiers;
- timestamp.

Do not log secrets or sensitive payloads merely to explain the decision.

## 8. Required tests

- fabricated actor and organization identifiers do not confer access;
- borrowed identifiers do not alter authorization outcome;
- inactive membership is denied;
- role removal takes effect within the declared revocation SLO;
- authority-table direct writes are impossible for app roles;
- cross-tenant object IDs are denied even when guessed;
- cache and search paths enforce the same authorization as primary reads;
- agent tools cannot access resources outside their explicit scope;
- break-glass use generates evidence and alerts;
- policy rollback restores the last-known-good policy without widening access.

## 9. Reference basis

The architecture is informed by NIST SP 800-207 and NIST SP 800-207A. See `REFERENCES.md`.
