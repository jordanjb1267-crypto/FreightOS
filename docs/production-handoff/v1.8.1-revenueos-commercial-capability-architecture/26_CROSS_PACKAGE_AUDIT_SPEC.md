# 26 — Cross-Package Audit Specification

## Objective

Before v1.9 proceeds, determine whether this v1.8.1 package is coherent with the accepted FreightOS architecture and real repository state.

## Required accepted inputs

Audit the merged/accepted repository and controlling packages, including at least:

- v1.3 Security & Resilience;
- v1.4 Network Architecture;
- v1.5 Enterprise Agent Operations;
- FacilityOS handoff associated with the accepted agent-operations architecture;
- v1.6 Brokerage Operations;
- v1.7 Agentic Logistics Network Coherence;
- v1.8 Agent Workforce Engineering & Certification;
- repository-local W0/W1 audit artifacts that are merged/accepted and applicable;
- current runtime/database/tests/CI.

Do not use an unmerged or unaccepted design branch as evidence.

## v1.9 quarantine

Do not read or use `design/v1.9.0-workforce-operational-design-completion` as design evidence. Preserve it untouched. This audit exists specifically to determine what should happen before further v1.9 work.

## Questions Claude must answer

1. Does “Capability as commercial boundary” conflict with any accepted product boundary?
2. Does v1.7 already contain sufficient entitlement/catalog primitives?
3. How should Capability references map to v1.8's 76 jobs/components and Job Books?
4. Are there existing capability packs that should be canonical rather than new catalog objects?
5. Can commercial entitlements be represented without weakening authority?
6. Which existing tables/types/services already implement plan/subscription/entitlement concepts?
7. Where should RevenueOS live without polluting participant legal/operational planes?
8. Can existing WorkUnit/graph infrastructure represent revenue workflows?
9. What is the correct identity/role model for external sellers/partners?
10. Which data classes may RevenueOS access?
11. Where should PromiseSet and approved product/security claims live?
12. Does an existing audit/event ledger satisfy commission provenance?
13. Which financial/payment boundaries must remain outside RevenueOS?
14. What must be added to CI to prevent catalog/promise/entitlement drift?
15. Which proposed RevenueOS jobs are agent/hybrid/deterministic/workflow/human/merge/missing?
16. Do any proposed jobs duplicate v1.8 roles?
17. What new Job Books/certification would eventually be required?
18. Which REV gates are already PASS/PARTIAL/FAIL/NOT IMPLEMENTED/NA from executable evidence?
19. Are any rules in this package weaker than inherited controls?
20. What owner decisions remain before implementation?
21. Which accepted jobs/components already perform freight-market, rate, capacity, news, disruption, commodity, fuel, multimodal, or maintenance-market intelligence?
22. Should each proposed FMI responsibility be RevenueOS-owned, shared substrate, participant-domain owned, deterministic service, workflow, human role, merge, or not implemented?
23. Can current event/evidence schemas represent provenance, freshness, confidence, correction lineage, and rights policy without creating a shadow source of truth?
24. Which existing Carrier/Brokerage/Facility/Shipper/Service jobs may consume FMI, and what authority boundaries must be proven?
25. What source/license/rights controls are absent?
26. Which FMI-01..FMI-28 gates are PASS/PARTIAL/FAIL/NOT IMPLEMENTED/NA from executable evidence?

## Audit outputs

Create repository-local audit artifacts outside immutable production-handoff package content, following existing audit precedent. Recommended folder:

```text
docs/revenueos-architecture-review/
```

Required files:

- `README.md`
- `CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md`
- `CAPABILITY_GRAPH_GAP_MAP.md`
- `ENTITLEMENT_ACTIVATION_GAP_MAP.md`
- `REVENUE_PLANE_AUTHORITY_MAP.md`
- `REVENUE_WORKFORCE_DECOMPOSITION.md`
- `PROMISE_FIREWALL_GAP_MAP.md`
- `PARTNER_CHANNEL_GAP_MAP.md`
- `ATTRIBUTION_COMMISSION_GAP_MAP.md`
- `DATA_PRIVACY_BOUNDARY_MAP.md`
- `REV_01_REV_48_MATRIX.md`
- `FMI_ARCHITECTURE_AND_SOURCE_GAP_MAP.md`
- `FMI_WORKFORCE_DECOMPOSITION.md`
- `FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md`
- `FMI_01_FMI_28_MATRIX.md`
- `CROSS_PACKAGE_CONFLICT_REGISTER.md`
- `PROPOSED_ADDITIVE_PR_SEQUENCE.md`
- `OWNER_DECISIONS.md` only if genuine decisions remain.

## Evidence rule

A gate is not PASS based on this handoff, an unmerged branch, a mock, or an architectural assumption. Cite repository paths, migrations, tests, commands, SHA, and runtime/CI evidence as appropriate.

## Stop condition

After the audit artifacts are produced and verified, **STOP**. Do not implement RevenueOS runtime work and do not resume v1.9 until owner review/authorization.

## Graph/Job Book reconciliation

The cross-package audit must reconcile every `AUDIT_CANDIDATE` RevenueOS/FMI Job Book and every `REV-G*`, `FMI-G*`, and `XPL-G*` graph against accepted v1.5–v1.8 responsibilities, WorkUnit ownership, typed handoffs, authority, autonomy, and existing durable workflow runtime. It must score `GR-01..GR-32` and stop before implementation.

## Operational Twin coexistence hypotheses

Test rather than assume:

- H14. One ParticipantOperationalTwin contract can support human-led through bounded-autonomy workflows without separate product foundations.
- H15. Existing TMS/WMS/ERP/ELD/etc. can remain authoritative for declared scopes while FreightOS provides agent/network value.
- H16. Field/object authority and synchronization can be explicit enough to prevent split-brain truth and adapter loops.
- H17. Human and agent work can share repository-native WorkUnits with one accountable owner per state.
- H18. Observed customer behavior can produce Twin change proposals without hidden learning or self-modified authority.
- H19. Internal Twin state can be projected into minimum-necessary network artifacts without exposing raw private state.
- H20. Native FreightOS customers can coordinate with non-native/connected counterparties without forcing simultaneous adoption.
- H21. Network messages can enter local workflows without transferring sender authority.
- H22. The repository can implement the 12 TWIN graphs without a second orchestration/runtime stack.

Audit TW-01..TW-40 and produce: `TWIN_RUNTIME_COEXISTENCE_GAP_MAP.md`, `SYSTEM_OF_RECORD_BINDING_MAP.md`, `HUMAN_AGENT_WORKUNIT_COEXISTENCE.md`, `TWIN_NETWORK_INGRESS_EGRESS_MAP.md`, `TWIN_LEARNING_CHANGE_CONTROL_GAP.md`, and `TW_01_TW_40_MATRIX.md`.
