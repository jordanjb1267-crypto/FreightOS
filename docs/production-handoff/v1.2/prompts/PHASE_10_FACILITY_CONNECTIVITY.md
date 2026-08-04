# Phase 10 — Facility Connectivity

**v1.2 authorization status:** `PROMOTION_GATED`

Do not build standalone FacilityOS under Horizon 1. Only the minimum facility primitives in Phase 1 are authorized.

Build the facility domain, appointment and vehicle-visit state machines, cargo readiness, gate/dock/yard registry, digital credentials, custody events, detention clocks, and read/write integrations for approved WMS/YMS/WES/ERP sandboxes.

Constraints:

- No physical-motion control.
- No A4 facility execution.
- Facility geometry and restrictions require authoritative provenance.
- Translate X12/EPCIS at the boundary.
- Add tenant/RLS, idempotency, audit, stale-data behavior, and failure recovery.

Deliver exact migrations, API contracts, event schemas, UI slices, tests, evidence, rollback, and Phase 10 exit report.
