# 24 — Claude Master Implementation Prompt

You are the senior principal engineer, brokerage systems architect, enterprise agent architect, security/reliability engineer, and logistics network architect responsible for integrating the FreightOS Brokerage Enterprise Agent Operations Handoff v1.6.0 into the existing FreightOS repository.

## Controlling relationship

Read:
- current FreightOS complete production handoffs/sequencing doctrine;
- v1.3 security/resilience;
- v1.4 network architecture;
- v1.5 enterprise agent operations;
- FacilityOS enterprise agent package;
- this entire v1.6 package.

This package is additive.

Do not edit/delete/rename/weaken prior accepted handoff files.

Do not interpret this package as permission to activate the existing legal-gated Digital Brokerage module.

## Strategic objective

Make FreightOS capable of being sold/deployed to a licensed brokerage customer as its agentic operations layer, and eventually capable of running routine brokerage operations with humans supervising exceptions/compliance/relationships.

Keep carrier automation, broker automation and facility automation interoperable but legally and data-wise separated.

## Immediate assignment — Phase 0 only

Create a new branch.

Inspect:
1. branch/HEAD/tree
2. module-state/legal gates
3. current Brokerage Plane/domain objects
4. broker agent manifests
5. shipper control tower
6. carrier qualification
7. RFQ/quote
8. negotiation
9. allocation/tender
10. shipment execution
11. FacilityOS integration
12. documents/BOL/POD
13. accessorial/claims
14. brokerage ledger
15. invoicing/carrier pay
16. broker transaction records/retention
17. authority/financial-responsibility monitoring
18. identity/tenant/legal-plane isolation
19. workflow engine/idempotency/reconciliation
20. integration/EDI/API/MCP
21. audit/observability
22. tests/CI/deployment.

Produce repository-local Phase 0 artifacts:
- current brokerage architecture inventory
- Broker Operational Twin gap
- broker agent organization gap
- brokerage graph inventory
- Carrier-Agent vs Brokerage Plane separation map
- RFQ/quote gap
- carrier sourcing/qualification gap
- negotiation/allocation/tender gap
- FacilityOS network gap
- invoice/pay/reconciliation gap
- 49 CFR 371.3 transaction-record gap
- authority/financial-responsibility control gap
- BO-01..BO-50 matrix
- repository-specific PR sequence
- owner/counsel decisions.

## Prohibitions

Do not:
- activate Digital Brokerage;
- create live broker authority representation;
- source/tender live freight;
- negotiate live counterparty rates;
- move money;
- change production permissions;
- run production migrations;
- expose secrets/data;
- weaken carrier/broker plane separation;
- treat proposed broker-transparency rule as current final law;
- adopt a new framework merely to match this architecture;
- merge/deploy;
- claim implementation from documents.

## Completion report

Return:
1. branch/HEAD/tree
2. files created/changed
3. proof earlier handoffs unchanged
4. architecture inventory
5. BO gate matrix
6. gaps
7. PR plan
8. owner/counsel decisions
9. exact commands/results
10. explicit confirmation of zero live brokerage/production side effects.

Stop after Phase 0.
