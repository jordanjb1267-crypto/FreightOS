# Autonomous Vehicle Activation Gate

No live autonomous mission may be enabled until every applicable item is evidenced and signed.

## Legal and commercial

- [ ] Customer and provider contracts identify responsibility, authority, limitations, data use, insurance, incidents, and termination.
- [ ] Transportation and product counsel approved the operating model.
- [ ] Brokerage or exchange activity, if any, passed its separate gate.
- [ ] Cargo, facility, jurisdiction, and corridor restrictions are documented.

## Provider and safety boundary

- [ ] Provider is authoritative for ODD, ADS state, readiness, fallback, and minimal-risk status.
- [ ] FreightOS API contains no dynamic-driving-task or physical-control command.
- [ ] Prohibited-command static and runtime tests pass.
- [ ] Provider can reject/hold/cancel a mission safely.
- [ ] Remote assistance and field recovery responsibilities are documented.
- [ ] Incident and post-event evidence process is tested.

## Facility and route

- [ ] Origin and destination facility compatibility is approved.
- [ ] Facility geometry/restrictions have authoritative provenance and version.
- [ ] Gate, staging, dock, loading/unloading, and custody workflows are tested.
- [ ] Route/corridor and time window are provider eligible.
- [ ] Cargo, weight, dimensions, equipment, and trailer are eligible.

## Security and reliability

- [ ] Mutual authentication and credential rotation pass.
- [ ] Signed messages, replay defense, idempotency, and audit pass.
- [ ] Integration outage, stale data, provider timeout, and partial failure tests pass.
- [ ] Kill switches and manual holds pass.
- [ ] Cybersecurity incident runbook is exercised.

## Operational evidence

- [ ] Offline contract tests pass.
- [ ] Historical/synthetic replay passes.
- [ ] Shadow operations meet approved thresholds.
- [ ] Approval-only live missions meet approved thresholds.
- [ ] Recovery and maintenance handoffs pass.
- [ ] Owner, operations, security, safety, and legal signoffs are recorded.
