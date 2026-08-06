# 09 — Observability, Service-Level Objectives, and Error Budgets

## 1. User-centered reliability

Infrastructure health is not enough. FreightOS must measure whether users can complete critical logistics operations correctly and within required time.

## 2. Golden signals and correctness

Every service should expose:

- traffic/throughput;
- errors;
- latency;
- saturation;
- dependency health;
- queue age and depth;
- retry/dead-letter volume;
- data-integrity or reconciliation failures;
- authorization denials and anomalies;
- freshness of operational data;
- business success rate for critical workflows.

## 3. Required service-level indicators

Examples:

- percentage of authorized active assignments retrievable;
- percentage of critical events durably accepted within threshold;
- percentage of roadside requests acknowledged without duplicate dispatch;
- percentage of payment commands producing one reconciled effect;
- percentage of authorization changes effective within revocation target;
- percentage of documents durably stored and retrievable by authorized parties;
- percentage of telemetry shown with accurate freshness state.

## 4. Error budgets

Each SLO has an error budget. Burn-rate alerts should detect both rapid outages and slow degradation.

Release policy:

- healthy budget: normal release cadence;
- warning threshold: elevated review and reliability work;
- exhausted Class A/B budget: pause nonessential releases for the affected service;
- exception: only approved emergency/security changes or changes directly restoring reliability.

## 5. Telemetry protection

- Propagate trace and correlation IDs across services and connectors.
- Redact or tokenize sensitive fields before telemetry emission.
- Never record secrets, full identity documents, bank details, or unrestricted payloads in traces.
- Restrict security logs and audit logs separately from ordinary observability.
- Protect log integrity and retention.
- Synchronize clocks and monitor clock drift.

## 6. Alert quality

Alerts must be actionable and owned. Every production alert requires:

- condition and user impact;
- severity;
- runbook;
- responsible team/role;
- suppression/deduplication behavior;
- escalation path;
- verification of recovery.

Do not page for conditions that require no immediate action. Do not hide severe user-impact signals inside dashboards.

## 7. Synthetic and canary monitoring

Continuously test critical journeys using nonproduction or isolated synthetic principals:

- login and authorization;
- active assignment retrieval;
- event ingestion;
- document store/retrieve;
- emergency request creation without real provider dispatch;
- queue and reconciliation flow;
- cross-tenant denial;
- last-known-good policy retrieval.

## 8. Observability during incidents

Telemetry systems must not be the only evidence source. Preserve durable audit, database, queue, deployment, and provider records. Observability degradation itself is a monitored incident because operating without visibility increases risk.
