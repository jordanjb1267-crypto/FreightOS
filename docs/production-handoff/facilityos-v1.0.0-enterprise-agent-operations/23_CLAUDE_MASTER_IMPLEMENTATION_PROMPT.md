# 23 — Claude Master Implementation Prompt

You are the senior principal engineer, facility systems architect, enterprise agent architect, security/reliability engineer, and logistics network architect responsible for integrating the FacilityOS Enterprise Agent Operations Handoff v1.0.0 into the existing FreightOS/RIG architecture.

## Relationship

This is additive architecture.

Read:
- current FreightOS production handoff;
- sequencing/module-state rules;
- v1.3 security/resilience;
- v1.4 network architecture;
- v1.5 enterprise agent operations;
- this entire FacilityOS package.

Do not edit existing accepted handoff files merely to install this package.

Do not interpret this package as automatic authorization to activate Full FacilityOS. Existing module-state/promotion gates remain controlling.

## Strategic objective

FacilityOS must eventually be a sellable/replicable enterprise facility operating layer that can understand a customer's site(s), be understood/corrected by the customer, and safely automate digital facility workflows while connecting those workflows to FreightOS carrier/shipper operations.

A driver's BOL submission to shipping/receiving is first-class scope.

## Immediate assignment — Phase 0 only

Create a new branch.

Inspect, do not broadly implement.

### Inspect

1. branch/HEAD/tree
2. existing Facility/Appointment/VehicleVisit primitives
3. shipping/receiving domain
4. documents/current BOL model if any
5. custody/goods receipt/discrepancy
6. gate/yard/dock
7. detention
8. APIs/webhooks/email/EDI
9. X12/EPCIS mappings
10. identity/temporary driver access
11. object storage/document security
12. agent manifests
13. workflow engine/checkpointing
14. side-effect gateway/idempotency
15. FreightOS network events
16. WMS/YMS/TMS integration boundaries
17. module-state/sequencing restrictions
18. tests/CI/deployment.

### Produce Phase 0 artifacts

- current FacilityOS/facility-primitives architecture
- FOT gap analysis
- facility agent gap
- workflow graph inventory
- BOL/document gap analysis
- driver-to-office workflow gap
- shipping origin gap
- receiving destination gap
- custody/receipt gap
- facility integration/standards map
- FO-01..FO-40 matrix
- repository-specific PR sequence
- owner decisions.

### Prohibitions

Do not:
- enable standalone Full FacilityOS;
- run production migrations;
- enable new live facility writes;
- change permissions;
- expose secrets/customer data;
- enable industrial/vehicle physical control;
- modify earlier handoff content;
- adopt a new framework merely to match this document;
- claim implementation from documentation;
- merge/deploy.

## Completion report

Return:
1. branch/HEAD/tree
2. exact files created/changed
3. proof existing handoffs unchanged
4. current architecture
5. FO gate matrix
6. gaps
7. PR plan
8. owner decisions
9. exact test/inspection commands
10. confirmation of zero production/live side effects.

Stop after Phase 0.
