# 21 — Network Observability and SLOs

## 1. User-centered measurements

Technical uptime is insufficient. Measure whether participants can publish, receive, understand, and act on logistics information correctly and on time.

## 2. Core indicators

- event publication success;
- event durability confirmation latency;
- delivery latency by partner/channel;
- consumer lag and dead-letter rate;
- duplicate and gap rate;
- schema rejection rate;
- authorization decision latency/availability;
- command acceptance and completion rate;
- idempotency collision/duplicate-prevention count;
- workflow deadline misses;
- stale telemetry and stale capability advertisements;
- reconciliation drift;
- partner conformance failures;
- cross-tenant/security anomalies.

## 3. Suggested service classes

### N0 — Emergency and active execution

Dispatch, active shipment, roadside, identity/authorization. Highest reliability and alert urgency.

### N1 — Transaction coordination

Tender, appointment, documents, service approvals, settlement instructions.

### N2 — Intelligence and analytics

Predictions, benchmarks, recommendations, historical reports.

### N3 — Administrative

Configuration, exports, nonurgent catalog changes.

Final numeric SLOs require owner decisions and production baselines; they must not be invented during documentation installation.

## 4. Trace correlation

Use stable correlation, causation, workflow, command, event, and trace identifiers. Logs must not contain unnecessary payloads or secrets.

## 5. Business reconciliation dashboards

Dashboards must expose unresolved gaps and state divergence, not only infrastructure health. A green broker with undelivered critical events is not healthy.
