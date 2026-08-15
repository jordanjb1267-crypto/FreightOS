# 11 — Integration Adapter and Conformance Architecture

## 1. Principle

FreightOS adapts to customer systems; it does not require wholesale replacement on day one.

## 2. Adapter types

- API
- webhook
- EDI X12/EDIFACT
- file/SFTP
- email ingestion
- event stream
- database CDC where approved
- manual import/export
- MCP/tool adapter over governed capabilities
- vendor-specific connectors.

## 3. Adapter contract

Every adapter declares:
- tenant
- external system
- direction
- authentication
- data classification
- canonical mappings
- semantic loss
- system-of-record fields
- read/write commands
- rate limits
- retries
- idempotency
- reconciliation
- outage behavior
- version support
- conformance tests.

## 4. System of record matrix

Per field/object, designate:
- FreightOS authoritative
- external authoritative
- shared/reconciled
- derived
- evidence only.

Conflict resolution is explicit.

## 5. Onboarding discovery

FreightOS should inspect available:
- schemas
- sample payloads
- API docs
- EDI implementation guides
- webhook catalogs
- export formats.

AI may propose mappings.
Mappings require deterministic validation and customer/system-owner confirmation before production writes.

## 6. Sandbox first

Before production:
- auth/connectivity
- fixtures
- mapping round trip
- duplicate
- out-of-order
- missing field
- invalid enum
- retry
- timeout
- schema version
- write confirmation
- reconciliation
- access revocation.

## 7. Connector isolation

Connector workers have least privilege.
A compromised connector cannot grant broader tenant authority or access unrelated tenant data.

## 8. Upgrade

Vendor/customer integration change:
- detect
- mark compatibility state
- test new version
- canary
- migrate
- preserve rollback
- re-certify affected workflows.
