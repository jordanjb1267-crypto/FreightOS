# 14 — Adoption and Onboarding Factory

## Goal

Make customer implementation increasingly a product capability.

## Universal onboarding graph

```text
Create participant/tenant
 ↓
Discover systems + organization
 ↓
Import evidence/SOPs/schema
 ↓
Build proposed Operational Twin
 ↓
Customer review/correction
 ↓
Connect read-only integrations
 ↓
Map workflows
 ↓
Instantiate agent organization
 ↓
Shadow
 ↓
Measure
 ↓
A3 selected actions
 ↓
A4 selected actions
 ↓
Expand
```

## Small customer

Use opinionated presets and plain language.

Never require the customer to understand:
- graph theory;
- agent manifests;
- event schemas.

## Enterprise customer

Expose:
- architecture/security
- SSO
- data residency
- conformance
- role/authority matrix
- workflow catalog
- rollout controls.

## Onboarding agents

Implementation agents may:
- inspect permitted schemas/docs;
- propose mappings;
- propose twin assertions;
- generate conformance fixtures;
- draft workflow maps.

They may not:
- self-approve authority;
- activate production write access;
- waive security/legal gates.

## Success metric

New customer = primarily configuration + integration + certification, not custom product development.
