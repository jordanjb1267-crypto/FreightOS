# 18 — Security, Privacy, and Data Governance

## Tenant/site isolation

Every private object belongs to verified tenant/site scope.
Client-provided IDs are selectors, never authority.

## Driver data minimization

Collect only needed:
- identity/credential
- carrier
- visit
- contact/channel
- operational acknowledgement
- document submission.

Avoid unnecessary persistent precise location tracking.

## Documents

- encrypted storage
- access control
- malware scan
- content type validation
- immutable original
- hash
- retention
- audit
- signed URLs/short expiry
- no public buckets.

## OCR/model

Documents are untrusted.
Prompt injection from document content cannot alter tools/policy.

## Sensitive cargo

Hazmat, pharma, food, high-value, customs/security may require stricter capability packs and data access.

## Identity

Support enterprise workforce identity/SSO and workload identity.
Driver/visitor access can use scoped temporary credentials.

## Cross-party sharing

Share minimum authorized view/assertion.
Do not copy an entire facility record to every carrier.

## Audit

Consequential:
- document disposition
- appointment
- credential
- visit
- custody
- receipt
- discrepancy
- release
- external write
is attributable and reconstructable.

## Deletion/retention

Tenant policy/legal obligations control retention.
Deletion must not rewrite immutable required audit/evidence history; use appropriate retention/legal-hold semantics.
