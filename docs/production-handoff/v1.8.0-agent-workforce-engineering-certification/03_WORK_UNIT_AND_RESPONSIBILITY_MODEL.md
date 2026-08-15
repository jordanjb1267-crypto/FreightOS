# 03 — Work Unit and Responsibility Model

Every operational job executes against a durable `WorkUnit`.

Required fields include work-unit ID, tenant/legal plane, job/version, subject refs, current owner, contributors, state, priority, deadline, authoritative context, artifact refs, approvals, exceptions, idempotency scope, evidence, and completion criteria.

Ownership lifecycle:

`UNASSIGNED → OWNED → HANDOFF_PENDING → OWNED_BY_NEXT → COMPLETE`

No active work may have zero accountable owners beyond routing SLA or two accountable owners simultaneously.

For every consequential business transition:
- A = exactly one accountable job/human role
- R = executing components
- C = consulted jobs
- I = authorized observers
