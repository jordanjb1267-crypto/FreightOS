# Implementation Roadmap

This roadmap is subordinate to the Constitution and `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md`.

## Horizon 1 — Current authorized build

### Phase 0 — Repository, governance, and scope control

Build monorepo, CI, constitution, ADRs, glossary, tenant/legal context, schemas, threat model, source register, module-state registry, disabled-state validation, and development environment.

Exit: validators pass; no production credentials; architecture review complete; legal-plane ambiguity resolved; all deferred modules prove disabled.

### Phase 1 — Universal core and road-carrier foundation

Build identity/hierarchy, legal mode, Shipment/Journey/Leg, modal SDK, road FTL adapter, fleet/equipment, load opportunity, economics, deterministic profitability, approval/audit, and minimum facility primitives for appointments, visits, loading/unloading, custody, detention, receipt, and discrepancies.

Create only interface/simulation scaffolds for brokerage, exchange, AV, rail, and ocean.

Autonomy: A0–A2. No consequential external action.

### Phase 2 — Dispatch Copilot

Build ingestion, normalization, scoring, ranking, multi-load planning, negotiation drafts, assignment recommendations, dispatch drafts, document intelligence, exception preparation, reconciliation, agent evaluations, and carrier-facing application slices.

Autonomy: A1–A2.

### Phase 3 — Selected Approval-to-Execute and production hardening

Build approved communication, counteroffer, load acceptance, assignment/dispatch, milestones, documents, and invoice submission using durable workflows, exact approval binding, idempotency, retries, compensation/manual recovery, full audit, security validation, pilot controls, and rollback.

Autonomy: selected A3 only.

### Horizon 1 stop gate

After Phase 3, stop implementation. Produce a full production-readiness and pilot report. Do not begin Phase 4 or any later product without an owner-approved promotion ADR and updated module registry.

## Horizon 2 — Promotion after Copilot validation

Potential scope, not currently authorized:

- Selected carrier A4 policies and canaries
- FacilityOS Lite
- Shipper and receiver collaboration
- Exception-only supervision for proven workflows

Prerequisites include reliable economics, stable state machines, no unauthorized actions, replay evidence, tested kill switches, tenant policy controls, and owner promotion.

## Horizon 3 — Conditional expansion

Potential scope, not currently authorized:

- Full FacilityOS after customer/design-partner validation
- Licensed Digital Brokerage after legal and operating gates
- Autonomous Vehicle provider integration after partner and safety gates
- Road–rail intermodal, port drayage, and ocean visibility after commercial justification

## Horizon 4 — Network evolution

Potential scope, not currently authorized:

- Policy-bounded autonomous corridors
- Multimodal brokerage
- Autonomous Freight Exchange after liquidity and settlement gates
- Global multimodal orchestration
- Future air operations

## Future phase prompts

Prompts numbered Phase 4 and later are preserved as planning artifacts. Their presence is not authorization to execute them. Each must be revised and explicitly unlocked at promotion time.
