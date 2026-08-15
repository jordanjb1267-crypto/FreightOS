# 03 — Participant Operational Twin Standard

## Universal concept

`ParticipantOperationalTwin` is the common abstraction for customer-understandable operational configuration.

Existing specializations:
- Company Operational Twin (carrier)
- Broker Operational Twin
- Facility Operational Twin

Planned:
- Shipper Operational Twin
- Service Provider Operational Twin.

## Mandatory sections

Every twin type declares:
1. participant/legal identity;
2. organizational topology;
3. roles/responsibilities;
4. systems of record;
5. vocabulary mappings;
6. assets/resources/capabilities;
7. workflows/SOPs;
8. policies/thresholds;
9. approvals/escalations;
10. integrations;
11. exception taxonomy;
12. data classification;
13. evidence/provenance;
14. uncertainty;
15. version/effective dates.

## Fact lifecycle

`PROPOSED → VERIFIED → APPROVED`

Alternate:
`DISPUTED / DEPRECATED`

Only approved facts may serve as authoritative customer configuration.

## Customer contract

The customer can answer:
- What does FreightOS believe?
- Where did that belief come from?
- Who approved it?
- Which workflows depend on it?
- What happens if I change it?
- Which agents can use it?
- Which counterparties can see any part of it?

## Universal diff

A Twin change produces:
- semantic diff;
- impacted workflow graph list;
- impacted agent manifest list;
- impacted autonomy grants;
- integration impact;
- network disclosure impact;
- required re-certification.

## No hidden learning

Observed behavior may produce a proposal.
It cannot silently rewrite approved operations.
