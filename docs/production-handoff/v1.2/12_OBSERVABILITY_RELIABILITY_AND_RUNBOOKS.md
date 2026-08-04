# Observability, Reliability, and Runbooks

## Correlation

Propagate trace_id, span_id, correlation_id, causation_id, workflow_id, tenant_id, legal_entity_id, actor_id, agent_deployment_id, and policy_version.

## Technical telemetry

Latency, errors, queues, retries, dead letters, workflow age, database, integrations, model latency/cost, tools, and cache.

## Agent telemetry

Recommendations, acceptance, overrides, denials, escalations, low-confidence cases, unsupported assertions, tool errors, and cost/workflow.

## Freight telemetry

Revenue/truck, contribution profit, all-mile RPM, deadhead, revenue/day, on-time performance, detention recovered, document and invoice cycle, days to pay, exception/claim rate, and trucks per human supervisor.

## Service levels

Define measured SLIs/SLOs for authentication, API, approvals, tracking, external dispatch, workflows, audit, billing, and brokerage. Do not promise an SLA before evidence.

## Degraded modes

### Model outage

Freeze new autonomous decisions, continue deterministic state/tracking, route decisions to humans.

### Policy outage

Deny autonomous mutation, allow read-only, use approved emergency process.

### Audit outage

Block consequential action except safety/cargo protection, capture emergency evidence, reconcile by incident workflow.

### Integration outage

Mark stale, retry safely, preserve workflow, open manual queue.

## Required runbooks

Incident command, security event, cross-tenant suspicion, model/policy failure, duplicate side effect, integration outage, DB failover/restore, workflow backlog, audit failure, billing correction, broker-security alert, kill switch, and emergency manual dispatch.

## Facility and autonomous telemetry

Track cargo-readiness forecast accuracy, appointment adherence, gate/dock dwell, detention, yard/dock utilization, custody completeness, receiving discrepancies, facility data freshness, provider eligibility denials, mission authorization, remote-assistance cases, minimal-risk events, recovery time, maintenance holds, and mission reconciliation.

High-frequency vehicle, sensor, and facility telemetry uses dedicated ingestion and storage. Transactional records retain authoritative summaries and immutable references.

## Additional degraded modes

### ADS provider outage

Do not authorize new missions. Preserve active mission state, notify operations, follow provider procedure, and require explicit recovery evidence.

### Facility-system outage

Mark capacity/readiness stale, stop automated appointment/credential actions, preserve manual facility operation, and reconcile events later.

### ODD or readiness uncertainty

Deny mission authorization. Provider-authoritative positive eligibility is required.

## Additional runbooks

Autonomous mission hold/cancel, provider outage, remote assistance, minimal-risk event, human recovery, autonomous cybersecurity event, facility evacuation/safety hold, gate outage, WMS/YMS outage, custody dispute, and facility data-provenance incident.
