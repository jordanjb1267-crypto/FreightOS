# 04 — Capability Contract Standard

Every sellable capability SHALL have a versioned definition with the following fields.

## Identity
- immutable `capability_id`;
- semantic/version identifier;
- product family;
- customer-facing name;
- lifecycle status;
- owner.

## Business contract
- outcome statement;
- target participant types;
- included workflow outcomes;
- explicit exclusions;
- prerequisites;
- supported deployment tiers;
- supported regions/legal contexts if constrained.

## Technical contract
- required Twin facts/classes;
- required integrations/adapters;
- workflow graph references;
- job/component references;
- command/action classes;
- evidence outputs;
- reconciliation requirements;
- degraded-mode behavior.

## Intelligence contract (when applicable)
- permitted market-signal classes;
- source classes and rights requirements;
- freshness/expiry policy;
- confidence/uncertainty requirements;
- customer relevance fields;
- allowed operational consumers;
- prohibited direct effects;
- forecast exposure rules;
- correction/recalculation behavior.

## Authority contract
- maximum commercial autonomy claim;
- required job certification levels;
- required approval classes;
- prohibited actions;
- financial/exposure limits if relevant;
- legal-plane constraints.

The effective autonomy is always the strict minimum of all controlling ceilings.

## Commercial contract
- SKU mappings;
- allowed pricing models;
- value meter(s);
- quantity definition;
- minimum/maximum term rules;
- renewal/expansion behavior;
- partner eligibility.

## Activation contract
Activation requires evidence for:
- entitlement valid;
- product version supportable;
- customer/Twin prerequisites;
- integration conformance;
- workforce certification;
- policy/legal approval;
- required customer approvals;
- observability/support readiness;
- rollout mode selected.

## Change classification

A change is **material** when it changes customer outcome, authority, data disclosure, legal responsibility, SLO/availability, billing meter, required integration, or compatibility. Material changes require capability versioning and migration analysis.
