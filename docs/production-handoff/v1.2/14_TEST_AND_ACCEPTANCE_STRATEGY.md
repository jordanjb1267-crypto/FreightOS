# Test and Acceptance Strategy

## Layers

Unit, property-based, schema/contract, state machine, policy, tenant isolation, RLS, workflow replay, sandbox integration, idempotency, failure injection, agent evaluation, historical replay, shadow comparison, load, security, DR, and user acceptance.

## Scope and sequencing invariants

- Authorized horizon is read from `config/scope/module_states.yaml`.
- No deferred module exposes a production worker, public route, or live external-write connector.
- No production brokerage, ADS, rail, ocean, air, or facility-automation credential exists.
- Future products are not billing-enabled or sale-enabled.
- No standalone FacilityOS application is deployable in Horizon 1.
- Rail, ocean, AV, brokerage, and exchange adapters remain simulation-only.
- No agent or feature flag can promote a module state.
- Phase 4 or later cannot execute under the default v1.2 authorization.
- Horizon 1 contains only the documented minimum facility primitives.

## Invariants

- No unauthorized cross-tenant data.
- Missing legal mode denies consequential commands.
- Duplicate commands do not duplicate external actions.
- Material changes invalidate approvals.
- Money is deterministic.
- States cannot skip prohibited transitions.
- Modal adapters cannot write other adapter data.
- New modes do not modify Shipment semantics.
- Agents cannot call unlisted tools.
- Red actions cannot be promoted by tenant policy.
- Billing corrections append adjustments.
- SaaS and brokerage revenue stay separated.

## Agent acceptance

Set evidence-based thresholds for accuracy, unsupported assertions, tool selection, schema validity, escalation, latency, cost, override, and safety.

## Scale

One truck, regional fleet, 100 trucks, 1,000 trucks, 100,000-truck simulation, six million telemetry events/hour, 100,000 workflows, and 10,000-item batches.

## Anti-overbuilding scans

CI must scan application, service, worker, route, deployment, secret, and billing registries for prohibited deferred implementations. Equivalent functionality is prohibited even when directory or feature names differ.

Required negative tests include:

- Attempting to register a deferred production worker fails.
- Attempting to enable a future billing product fails.
- Attempting a live external write through a scaffold adapter fails.
- Attempting to set the authorized horizon above 1 without a signed promotion artifact fails.
- Attempting to create an AV dynamic-driving command fails schema and policy validation.
- Attempting to deploy a standalone facility-control application fails the Horizon 1 validator.

## Release evidence

Exact SHA, migrations, test commands/results, security findings, agent evals, load results, rollback, limitations, flags, and legal gate status.

## Facility and autonomous invariants

- No API, tool, schema, prompt, or adapter exposes steering, acceleration, braking, lane change, reversing, perception override, remote driving, robotics, PLC, conveyor, dock-restraint, door, or safety-interlock control.
- Provider is authoritative for ODD, ADS state, vehicle readiness, fallback, and minimal-risk status.
- Facility/operator systems are authoritative for physical movement and safety controls.
- Facility geometry, restrictions, and compatibility have provenance and version.
- Stale cargo readiness or capacity cannot silently authorize dispatch or facility automation.
- Custody transitions require authorized parties and evidence.
- Autonomous mission activation requires the signed gate and exact scope.
- Provider rejection or hold cannot be overridden by an agent.
- High-frequency telemetry cannot overload or mutate the core shipment row per observation.
- Remote assistance cannot be interpreted as remote driving.

## Required facility tests

Appointment state/property tests, capacity conflicts, credential expiration/replay, gate/dock isolation, detention calculations, custody evidence, discrepancy workflows, WMS/YMS outage, late events, duplicate EPCIS/EDI messages, facility kill switches, and physical-control denial.

## Required autonomous tests

Provider contract tests, schema compatibility, signed-message/replay defense, mission idempotency, ODD denial, stale readiness, facility incompatibility, cargo/equipment rejection, provider outage, mission hold/cancel, remote-assistance case, minimal-risk ingestion, recovery, maintenance hold, cybersecurity hold, audit reconstruction, and no-control surface scans.

## Scale additions

Facility networks of 1, 100, and 1,000 sites; 1 million visits/day simulation; 100,000 connected autonomous units; mission bursts; high-frequency telemetry separated from transactional workloads; and global facility policy propagation.
