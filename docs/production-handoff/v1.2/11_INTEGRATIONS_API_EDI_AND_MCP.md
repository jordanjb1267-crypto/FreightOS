# Integrations, API, EDI, and MCP

## Integration order

1. Canonical FreightOS APIs
2. Signed webhooks and event subscriptions
3. EDI and partner adapters
4. MCP resources and tools
5. Embedded/OEM distribution

MCP does not replace APIs, workflows, policy, billing, or the ledger.

## Integration registry

Record provider, purpose, data classification, legal plane, tenants, authentication, credential owner, webhook verification, rate limits, retry, idempotency, health, kill switch, retention, contract, and cost.

## Connector categories

TMS, load sources, ELD/telematics, routing, email, SMS/voice, accounting, factoring, payments, FMCSA/public authority, rail systems, ocean APIs, ERP/WMS, EDI networks.

## MCP resources

- `rig://tenant/{id}/fleet/availability`
- `rig://tenant/{id}/loads/opportunities`
- `rig://tenant/{id}/shipments/active`
- `rig://tenant/{id}/policies/dispatch`
- `rig://tenant/{id}/exceptions/open`

## MCP tools

### Read

fleet.get_availability, drivers.get_feasibility, loads.search, loads.score_profitability, plans.compare, counterparties.get_risk, shipments.get_status, documents.get_requirements.

### Prepare

negotiations.prepare_counter, dispatch.prepare_instructions, quotes.prepare, invoices.prepare, exceptions.prepare_response.

### Controlled

negotiations.send_counter, loads.accept, loads.reject, assignments.create, dispatch.send, milestones.update, documents.submit, invoices.submit, tenders.send.

## Controlled-tool requirements

Authenticated actor, tenant/legal context, permission, policy, approval when required, idempotency, structured parameters, audit, and result reconciliation.

Human visibility and denial are default for consequential MCP tools unless FreightOS policy explicitly authorizes A4.

## EDI

Translate at the boundary. Never make X12 segments the internal model.

Road initial: 204, 990, 214, 210.  
Rail initial: 404, 417, 410, 421.

Maps are versioned per trading partner.

## Facility and autonomous integrations

Add ERP, WMS, WES, YMS, gate, yard, dock, sensor, EPCIS, ADS-provider, OEM, remote-assistance, charging/fueling, and maintenance connectors.

Initial facility standards mappings may include X12 163, 322, 940, 943, 944, and 945, plus GS1 EPCIS/CBV.

### Additional MCP read tools

facility.get_readiness, facility.get_capacity, appointments.get, vehicle_visits.get, custody.get, autonomous_missions.get, autonomous_vehicles.get_health_summary, odd.get_provider_decision.

### Additional MCP prepare tools

appointments.prepare, facility.prepare_credential, facility.prepare_target, custody.prepare, autonomous_missions.prepare_request, remote_assistance.prepare_request, maintenance.prepare_request.

### Controlled tools

appointments.confirm, appointments.reschedule, credentials.issue, facility_targets.submit, custody.record, goods_receipts.record, autonomous_missions.request, autonomous_missions.hold, autonomous_missions.cancel, remote_assistance.request, recovery.request, maintenance.request.

Controlled tools cannot bypass activation gates. No MCP tool may expose physical-motion control.
