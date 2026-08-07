# 10 — Incident Response and Breach Communication Standard

## 1. Incident definition

An incident is any event that materially threatens or affects confidentiality, privacy, integrity, availability, authorization, financial correctness, safety-adjacent operation, or trust in system history.

## 2. Severity model

- **SEV-0:** Existential or network-wide compromise, systemic false execution, unrecoverable corruption, or inability to trust authority/audit state.
- **SEV-1:** Confirmed or highly credible cross-tenant exposure, privileged compromise, material Class A outage, widespread incorrect dispatch/payment/service action.
- **SEV-2:** Limited customer data or operational impact, serious integration compromise, significant Class B outage, contained financial inconsistency.
- **SEV-3:** Low-impact customer issue, limited degradation, vulnerability without observed exploitation.
- **SEV-4:** Nonincident defect or improvement tracked through ordinary work.

See `checklists/INCIDENT_SEVERITY_MATRIX.md`.

## 3. Incident roles

- Incident Commander
- Operations Lead
- Security/Forensics Lead
- Product/Domain Lead
- Communications Lead
- Legal/Privacy Adviser when applicable
- Evidence Recorder
- Executive Risk Owner for SEV-0/1

The Incident Commander coordinates; they should not be overloaded with implementing every fix.

## 4. Response lifecycle

1. Detect and validate.
2. Classify severity and declare incident.
3. Preserve evidence and establish a timeline.
4. Contain immediate harm.
5. Determine affected tenants, data, operations, and counterparties.
6. Eradicate root access or defect.
7. Restore through verified state.
8. Reconcile operations and data.
9. Communicate verified impact and required user action.
10. Complete postmortem and permanent corrective actions.

## 5. Containment priorities

- stop unauthorized or unsafe action;
- protect active users and critical operations;
- revoke or scope credentials;
- disable defective feature/integration/agent;
- isolate cell or tenant where appropriate;
- preserve audit and forensic evidence;
- avoid destructive cleanup before evidence capture;
- provide a safe fallback path.

## 6. Customer communication

Communication must be factual and avoid unsupported certainty. Include as known:

- what happened;
- when it began and ended;
- which services/data were affected;
- whether unauthorized access or incorrect operations were confirmed;
- actions FreightOS took;
- actions the customer should take;
- current status;
- next update channel or cadence during an active severe event.

Notification timing and content must comply with applicable contracts and laws; legal counsel should review material incidents.

## 7. Evidence preservation

Preserve:

- relevant logs and audit records;
- deployment and configuration versions;
- identity and authorization changes;
- queue and connector records;
- affected database/object versions;
- alert timelines;
- operator actions;
- external-provider responses;
- hashes and chain-of-custody for exported evidence.

## 8. Postmortem requirements

A SEV-0/1/2 postmortem must include:

- executive impact summary;
- detailed timeline;
- detection and response analysis;
- root cause and contributing conditions;
- blast radius;
- what worked and failed;
- customer/data/financial/operational impact;
- corrective actions with owners and dates;
- regression tests and monitoring added;
- governance or threat-model updates;
- evidence that reconciliation is complete.

Use `templates/POSTMORTEM_TEMPLATE.md`.

## 9. Reference basis

Use NIST SP 800-61 Rev. 3 and NIST CSF 2.0 as the baseline structure. See `REFERENCES.md`.
