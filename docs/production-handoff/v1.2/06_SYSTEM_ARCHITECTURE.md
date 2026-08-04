# System Architecture

## Repository

```text
rig-freightos/
├── apps/
├── services/
├── packages/
├── workflows/
├── config/
├── schemas/
├── db/
├── evals/
├── infra/
├── docs/
└── scripts/
```

## Applications

- Fleet Control Tower
- Driver Mobile
- Shipper Control Tower
- Brokerage Operations Console
- FreightOS Administration

## Services

- API
- Workflow workers
- Integration workers
- Communications
- Document processing
- Model gateway
- MCP server
- Billing

## Core packages

Domain, schemas, database, events, policy, agents, pricing/entitlements, integration SDK, modal SDK, observability, security, and UI.

## Command path

```text
Client/Agent/Integration
→ API gateway
→ Authentication
→ Tenant/legal context
→ Schema validation
→ Permission
→ Policy
→ Approval
→ Domain handler
→ Transaction
→ Outbox event
→ Workflow/activity
→ External side effect
→ Audit
```

## Query path

Use tenant-filtered read services, materialized read models, explicit freshness, and no privileged browser-direct DB access.

## Stores

- PostgreSQL: authoritative state
- Object storage: documents
- Search index: derived search
- Vector store: non-authoritative retrieval
- Telemetry store: high-volume sensor/location data
- Audit archive: immutable retention

## Workflows

Durable workflows for negotiation, acceptance, dispatch, shipment execution, appointments, document chase, detention, exceptions, invoicing, carrier qualification, brokerage tender, and multimodal handoff.

External calls belong in retryable activities.

## Events

CloudEvents-compatible envelope, transactional outbox, versioned types, idempotent consumers, correlation/causation, dead letters, replay, schema compatibility, and pointers instead of duplicated sensitive documents.

## Deployment

Managed PostgreSQL, object storage, secrets, containers, Temporal/equivalent, managed queue, WAF/CDN, OpenTelemetry collector, and separate dev/staging/shadow/limited/general production.

Production cannot depend on the owner laptop.

## Extraction candidates

Telemetry, integrations, communications, documents, model gateway, brokerage ledger, billing, search/analytics—only when justified.

## Physical logistics applications

- Shipper Operations Control Tower
- Receiver Operations Control Tower
- Facility Operations Console
- Autonomous Fleet Operations Center
- Maintenance Network Console

## Added services and packages

- Facility domain and adapter SDK
- Appointment and vehicle-visit workflows
- Custody and receiving service
- Facility digital-twin registry
- Autonomous Vehicle Gateway
- Provider adapter SDK
- Mission orchestration workers
- Remote-assistance coordination
- Vehicle-health summary ingestion

The Autonomous Vehicle Gateway is a strategic mission interface only. Dynamic-driving-task and physical-control operations are structurally absent.
