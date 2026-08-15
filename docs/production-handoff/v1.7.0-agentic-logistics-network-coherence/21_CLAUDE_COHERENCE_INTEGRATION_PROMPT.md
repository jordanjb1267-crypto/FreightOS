# 21 — Claude Coherence Integration Prompt

You are the senior principal architect responsible for reconciling FreightOS v1.4 network architecture, v1.5 enterprise agent operations, FacilityOS enterprise agent operations, v1.6 brokerage enterprise agent operations, and the current FreightOS implementation into one coherent architecture without disturbing accepted work.

## Immediate assignment — documentation/control integration only

Do not implement deferred runtime modules.

### Read first

- Constitution
- sequencing/module states
- v1.3 security/resilience
- v1.4 network architecture
- v1.5 enterprise agent operations
- FacilityOS enterprise agent package
- v1.6 brokerage enterprise agent package
- this v1.7 package
- current repository architecture/runtime.

## Goal

Establish a repository-local coherence map that proves all products use:

`Participant Operational Twin → Agent Organization → Typed Durable Workflow → Authority/Legal Gate → FreightOS Protocol → Adapter/Counterparty → Verification/Reconciliation`

without destructive renaming or architectural forks.

## Phase C0 — inspect only

Create a new branch.

Produce:
1. current product/module map;
2. domain ownership map;
3. twin inventory and compatibility map;
4. agent-manifest inventory;
5. workflow-runtime inventory;
6. network-artifact inventory;
7. legal-plane matrix;
8. integration/adapter map;
9. customer entry-point map;
10. cross-party shipment sequence diagram from actual code/contracts;
11. module-state/dependency graph;
12. COH-01..COH-30 matrix;
13. duplication/conflict inventory;
14. proposed additive PR sequence;
15. owner decisions.

## Restrictions

Do not:
- rename existing twins;
- rewrite existing handoffs;
- activate FacilityOS/Brokerage/Exchange;
- change module states;
- run production migrations;
- enable live external writes;
- change authority;
- merge/deploy;
- claim coherence because docs agree.

## Required recommendation

Where implementation duplicates concepts, prefer:
- shared interfaces/contracts;
- adapters;
- backward-compatible migration;
over destructive consolidation.

## Completion

Return:
- branch/HEAD/tree
- files changed
- proof accepted handoffs unchanged
- COH matrix
- conflicts/duplication
- target architecture
- PR sequence
- no-live-side-effect attestation.

Stop after C0.
