# FreightOS v1.8.1 — RevenueOS & Commercial Capability Architecture

**Status:** additive design / governance handoff only  
**Position in sequence:** after accepted v1.5–v1.8 architecture, before any authorization to proceed with v1.9 implementation  
**Activation:** NONE  
**Runtime changes:** NONE  

## Purpose

This package turns FreightOS's already-defined modular architecture into a governed commercial system that can sell a customer the Operational Twin and capabilities they need without requiring purchase of every FreightOS agent or workflow.

It defines:

- a canonical Product → Operational Twin → Capability → Job/Component → Workflow hierarchy;
- machine-readable product/capability catalog contracts;
- versioned commercial entitlements separated from runtime authorization;
- RevenueOS as a commercial configuration, selling, partner, attribution, commission, and expansion system;
- a commission/referral/channel architecture with explicit authority boundaries;
- a Sales Promise Firewall preventing unsupported product, security, integration, SLA, autonomy, legal, and roadmap commitments;
- deterministic pricing/discount/commission control points;
- AI-assisted revenue jobs with no production operating authority;
- seller certification and evidence requirements;
- customer land/expand mechanics that strengthen the FreightOS network without forcing monolithic adoption;
- a shared Freight Market Intelligence substrate and RevenueOS Market Intelligence Division for rates, capacity, demand, freight news, disruptions, fuel, multimodal, and maintenance/service-market intelligence;
- customer-specific market relevance/impact mapping for Carrier, Broker, Facility, Shipper, and Service/RigDesk operational domains;
- strict separation between intelligence signals and operational command authority;
- an audit-only Claude prompt that must compare this package against the accepted repository before implementation.

## Canonical commercial doctrine

> **Land by Operational Twin. Sell by Capability. Activate through certified Agent Workforces. Expand by workflow. Connect through the FreightOS Network.**

Customers buy outcomes/capabilities, not implementation details such as a specific model or individual runtime worker. FreightOS retains freedom to split, merge, replace, or improve agent implementations while preserving the purchased capability contract.

## Controlling relationship

This package is additive. It SHALL NOT weaken or silently reinterpret any stricter accepted rule from FreightOS security/resilience, network architecture, enterprise agent operations, FacilityOS, Brokerage, network coherence, or workforce engineering/certification packages.

Where rules conflict:

1. the stricter security, tenant, privacy, authority, legal, audit, resilience, or certification rule wins;
2. the conflict is documented;
3. the affected implementation is blocked pending owner decision when material.

## Critical non-activation statement

Installing or accepting this package does **not**:

- create production database tables;
- activate RevenueOS agents;
- create seller accounts or partner accounts;
- authorize commission payments;
- change pricing;
- change customer entitlements;
- enable A3/A4/A5 autonomy;
- activate deferred Brokerage, FacilityOS, Shipper, Exchange, payment, financing, insurance, or marketplace functionality;
- grant any sales or partner user operational authority;
- authorize v1.9 implementation;
- ingest or redistribute any market/news feed;
- authorize automated market-based pricing, load acceptance, dispatch, repair, roadside, or facility physical actions;
- prove repository implementation of any design described here.

## v1.9 isolation rule

The preserved, unaccepted `design/v1.9.0-workforce-operational-design-completion` branch/draft is **not evidence** for the audit requested by this package. Claude must not read, cherry-pick, diff for design evidence, or use that draft to manufacture compatibility. Audit accepted/merged architecture and the real current repository only. Preserve the draft untouched.

## Package index

See `00_MASTER_HANDOFF.md` for the controlling design and `28_CLAUDE_CROSS_PACKAGE_AUDIT_PROMPT.md` for the first executable instruction.

## Expected repository installation path

```text
docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/
```

## First action after installation

Run **audit only**. Do not implement runtime changes until the owner has reviewed Claude's cross-package findings and explicitly authorizes a subsequent implementation package/phase.

## Typed graph and provisional Job Book control extension

RevenueOS/FMI audit candidates are now specified through:
- `39_TYPED_GRAPH_ENGINEERING_STANDARD.md`;
- `40_REVENUEOS_TYPED_GRAPH_CATALOG.md`;
- `41_FMI_TYPED_GRAPH_CATALOG.md`;
- `42_CROSS_PLANE_OPERATIONAL_CONSUMPTION_GRAPHS.md`;
- `43_GRAPH_AUTHORITY_STATE_AND_HANDOFF_INVARIANTS.md`;
- `44_GRAPH_FAILURE_RETRY_RECONCILIATION.md`;
- `45_GRAPH_CERTIFICATION_SIMULATION_AND_REPLAY.md`;
- `46_GRAPH_ACCEPTANCE_GATES_GR_01_GR_32.md`;
- machine-readable `graphs/`;
- provisional audit-candidate `job_books/`;
- graph ownership/handoff matrices.

These artifacts remain non-activating design candidates. Claude must audit them against accepted v1.3–v1.8 Job Books, WorkUnits, workflow runtime, authority, network, and certification contracts before any candidate is accepted as J0 or implemented.


## Final owner sequence and release integrity

- `47_TYPED_ARTIFACT_WORKUNIT_AND_EDGE_CONTRACTS.md` defines machine-checkable WorkUnit/handoff contracts.
- `48_GRAPH_CHANGE_MANAGEMENT_AND_VERSIONING.md` defines immutable graph-version behavior.
- `49_END_TO_END_IMPLEMENTATION_SEQUENCE.md` is the complete owner install → audit → review → later implementation sequence.
- `50_PACKAGE_RELEASE_AND_INTEGRITY_CHECKLIST.md` defines the package-integrity release checklist.
- `schemas/provisional-job-book.schema.json` validates the 37 machine-readable audit-candidate Job Book descriptors.

The package now has four independent acceptance-gate families: `REV-01..REV-48`, `FMI-01..FMI-28`, `GR-01..GR-32`, and `TW-01..TW-40` (148 gates total). None may be converted to runtime PASS from documentation presence alone.

## Final Operational Twin interaction refinement

Files `51`–`62` formalize human+agent coexistence, system-of-record binding/synchronization, Twin learning/change control, network communication/projection, participant-specific behavior, 12 Twin interaction graphs, and TW-01..TW-40. This refinement is audit-candidate architecture only.
