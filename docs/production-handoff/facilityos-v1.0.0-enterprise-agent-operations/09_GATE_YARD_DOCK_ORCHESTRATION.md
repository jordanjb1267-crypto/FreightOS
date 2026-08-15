# 09 — Gate, Yard, and Dock Orchestration

## Gate

Digital coordination:
- appointment/visit identity
- credential
- check-in
- restrictions
- required documents
- queue/staging destination.

No barrier/door/PLC actuation by general FacilityOS agent.

## Yard

Track:
- staging zones
- trailer/vehicle position as authorized
- queue state
- drop/live status
- dock readiness
- yard tasks as digital work objects.

Optimization may recommend moves.
Authorized humans/certified yard systems control physical execution.

## Dock

Track:
- dock capability
- assignment target
- readiness
- service start/end
- occupancy
- cargo/equipment restrictions
- loading/unloading queue.

## Conflict prevention

Deterministically validate:
- double booking
- incompatible equipment/cargo
- closed dock
- hold
- stale readiness
- conflicting active visit.

## Facility target event

An assignment is an operational target, not a physical-motion command.

## Degraded operation

On YMS/access outage:
- preserve manual facility operation;
- disable unsafe automatic target/credential writes;
- capture events for later reconciliation;
- expose stale state.
