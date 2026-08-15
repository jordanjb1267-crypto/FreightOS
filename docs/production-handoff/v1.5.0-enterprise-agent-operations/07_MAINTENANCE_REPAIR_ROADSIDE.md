# 07 — Maintenance, Repair, and Roadside Operations

## 1. Purpose

Maintenance/repair/roadside is a first-class operational graph because asset readiness directly affects dispatch and mission feasibility.

## 2. Readiness graph

Inputs:
- scheduled maintenance
- fault/diagnostic signals
- driver/operator report
- inspection state
- service history
- open repair order
- asset restrictions
- parts/service availability where known.

Output:
`READY | READY_WITH_CONDITION | NOT_READY | UNKNOWN`

Include:
- evidence
- freshness
- unresolved faults
- expiry
- policy version.

Never present as manufacturer/safety certification unless governed as such.

## 3. Repair graph

```text
Issue detected/reported
      ↓
Severity + immobilization classification
      ↓
Safety/emergency gate
      ↓
Asset/mission context
      ↓
Company repair policy
      ↓
Preferred/eligible provider discovery
      ↓
Estimate/availability request
      ↓
Approval threshold
      ↓
Service command
      ↓
Status tracking
      ↓
Completion evidence
      ↓
Readiness reassessment
      ↓
Dispatch impact / next mission
```

## 4. Roadside graph

Supports:
- breakdown
- tow
- tire
- fuel
- lockout/jump where relevant
- mobile repair
- emergency service escalation.

Critical controls:
- exact asset identity;
- safe location handling;
- approved provider policy;
- spending cap;
- driver/customer approval where required;
- ETA/status;
- cancellation;
- duplicate-request prevention;
- read-after-write confirmation;
- post-service evidence.

## 5. One-truck behavior

The owner may preconfigure:
- preferred service network;
- maximum auto-authorized roadside amount;
- actions always requiring approval;
- emergency contacts;
- towing preferences.

This lets FreightOS prepare or execute bounded assistance without requiring a fleet maintenance department.

## 6. Enterprise behavior

Large fleets may use:
- central maintenance control;
- regional shops;
- preferred-vendor contracts;
- warranty programs;
- PO thresholds;
- after-hours escalation;
- parts workflows;
- replacement/substitute equipment;
- dispatch re-planning.

## 7. Integration with RigDesk

Where RigDesk owns asset/service-provider UX or maintenance records, FreightOS uses governed APIs/events rather than duplicating system-of-record ownership.

FreightOS consumes readiness and orchestrates mission consequences; RigDesk may own detailed maintenance/provider operations according to the controlling ecosystem domain map.

## 8. Safety

AI does not diagnose safety-critical mechanical condition as a definitive certification.
Ambiguous high-risk conditions escalate.
Emergency services and roadside actions declare fail-safe/degraded behavior explicitly.
