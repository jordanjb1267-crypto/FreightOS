# 05 — Data Classification, Privacy, Retention, and Deletion

## 1. Purpose

FreightOS must become a useful network without becoming an unnecessary concentration of sensitive data. Data collection and sharing are constrained by purpose, classification, contract, consent, and retention.

## 2. Classification levels

| Level | Name | Examples | Default treatment |
|---|---|---|---|
| D0 | Public | Published product information, approved public network statistics | Public release allowed through controlled publication |
| D1 | Internal | Internal procedures, non-sensitive configuration | Authenticated workforce access |
| D2 | Network Restricted | Shipment statuses shared with authorized counterparties | Purpose-bound network access and audit |
| D3 | Confidential | Rates, margins, maintenance records, facility notes, contracts | Tenant/counterparty scoped; encrypted; limited export |
| D4 | Highly Sensitive | Identity documents, bank details, credentials, security evidence, precise personal location | Strong encryption/tokenization, strict access, enhanced audit |
| D5 | Regulated/Critical | Data subject to specific legal/contractual restrictions or capable of systemic harm | Dedicated controls, explicit approval, minimal storage |

The example machine-readable policy is in `policies/data-classification.yaml`.

## 3. Data inventory requirements

For every sensitive data element or event type record:

- canonical name;
- description and business purpose;
- classification;
- originating system;
- owner and steward;
- users and systems permitted access;
- legal/contractual basis where applicable;
- sharing and model-use rules;
- retention period;
- deletion or anonymization method;
- backup expiration behavior;
- audit requirements;
- data residency restrictions;
- incident notification considerations.

## 4. Privacy-by-design rules

- Prefer a verified assertion over copying the underlying document.
- Separate identity verification from broad identity-document access.
- Separate live operational location from historical analytics.
- Reduce precision and retention when exact location is not necessary.
- Do not use customer data for generalized model training unless the agreement and consent permit it.
- Prevent prompt, embedding, telemetry, and support systems from becoming uncontrolled secondary data stores.
- Offer tenant administrators visibility into integrations and data-sharing scopes.
- Record consent and authorization changes as versioned events.

## 5. Retention classes

Each data type must use one of these default classes unless a documented rule overrides it:

- **R0 — Ephemeral:** minutes to 24 hours; transient processing and caches.
- **R1 — Short operational:** up to 90 days; retry, temporary diagnostics, low-value telemetry.
- **R2 — Active relationship:** retained while needed for active service plus a defined closure period.
- **R3 — Commercial record:** retained according to contract, tax, claims, dispute, and legal requirements.
- **R4 — Security/audit:** retained according to security and assurance need; access tightly restricted.
- **R5 — Aggregated/de-identified:** may be retained longer only when reidentification risk is controlled.

“Retain forever” is not a valid default.

## 6. Deletion and legal hold

- Deletion must propagate through primary stores, replicas, indexes, caches, and asynchronous processors.
- Backups may expire according to their immutable lifecycle rather than being selectively rewritten, provided deleted data is not restored into active use without reapplying deletion records.
- Legal holds must be documented, scoped, approved, and removed when no longer valid.
- Deletion jobs require reconciliation reports and failure alerts.

## 7. Location and driver data

Location data can create personal and commercial risk. FreightOS MUST:

- collect only required precision and frequency;
- clearly distinguish current, stale, predicted, and manually reported location;
- limit access to authorized operational purposes;
- restrict historical location queries;
- protect off-duty or nonoperational data;
- define emergency access and review;
- avoid representing stale telemetry as current.

## 8. Data-processing inventory template

Use `templates/DATA_PROCESSING_INVENTORY_TEMPLATE.md` for each domain before production enablement.
