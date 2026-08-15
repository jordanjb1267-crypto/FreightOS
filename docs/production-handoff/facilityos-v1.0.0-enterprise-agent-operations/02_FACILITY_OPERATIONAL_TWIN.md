# 02 — Facility Operational Twin (FOT)

## Purpose

The FOT is the customer-visible representation of how FacilityOS understands a site/network.

## Structure

### Enterprise
- facility network
- legal entity
- business unit
- region
- site/campus

### Site topology
- building
- gate
- yard
- staging area
- dock
- shipping office
- receiving office
- inspection area
- parking/queue area
- logical operational zone

### Rules
- operating hours
- appointment windows
- early/late policy
- check-in policy
- ID/credential requirements
- trailer/equipment restrictions
- cargo restrictions
- PPE/site rules
- shipping instructions
- receiving instructions
- document/BOL requirements
- seal rules
- temperature rules
- detention policy
- release rules

### Roles
- guard/gate
- shipping office
- receiving office
- dock coordinator
- yard coordinator
- warehouse supervisor
- operations manager
- inventory control
- quality/safety
- customer service
- escalation/on-call

### Systems
For each ERP/WMS/YMS/WES/TMS/access/document system:
- owner
- authoritative fields
- interface
- freshness
- read/write
- outage behavior
- credential class
- reconciliation.

## Fact states

`PROPOSED | VERIFIED | APPROVED | DISPUTED | DEPRECATED`

No PROPOSED fact can authorize a consequential action.

## Vocabulary

Examples:
- "shipping window"
- "lumper"
- "will call"
- "drop lot"
- "live unload"
- "receiving number"
- "PO"
- "BOL"
- "load number"
- "pickup number"

Map customer terms to canonical concepts. Ambiguous identifiers stay unresolved until verified.

## Facility geometry

FacilityOS may maintain logical/operational geometry and restrictions.

Safety-critical geometry/clearance/robotics routes require authoritative facility/controller sources and explicit provenance.

## FOT change impact

A change reports impacted:
- appointments
- visit credentials
- workflows
- document requirements
- agent manifests
- autonomy grants
- carrier instructions
- integrations.

## Drift

Create review when actual operation repeatedly differs from FOT.
Never silently rewrite policy from observed behavior.
