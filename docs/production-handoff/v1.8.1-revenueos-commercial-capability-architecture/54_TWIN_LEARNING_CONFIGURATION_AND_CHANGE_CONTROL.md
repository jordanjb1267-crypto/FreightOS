# 54 — Twin Learning, Configuration, and Change Control

## Principle

The Twin may learn **about** how a customer operates; it may not silently rewrite how the customer is authorized to operate.

## Knowledge classes

- `OBSERVED` — event or behavior observed with provenance;
- `INFERRED` — model/analytic interpretation with confidence;
- `PROPOSED` — candidate Twin/SOP/configuration change;
- `VERIFIED` — evidence checked according to policy;
- `APPROVED` — authorized customer configuration;
- `DISPUTED`;
- `DEPRECATED`.

Only approved facts/rules may become authoritative configuration where v1.7 requires approval.

## Learnable domains

Subject to customer policy and data rights, the Twin may propose learning about:

- role ownership;
- common routing patterns;
- preferred communication channels;
- business hours/time zones;
- recurring exception handling;
- appointment practices;
- document expectations;
- escalation chains;
- customer/vendor preferences;
- workflow sequencing;
- thresholds that are not constitutional/legal/safety boundaries.

## Non-learnable without explicit controlled change

Observation cannot silently modify:

- identity/authority;
- legal plane;
- financial destinations;
- safety constraints;
- privacy/data-sharing rules;
- kill switches;
- autonomy ceiling;
- seller promises;
- regulated compliance decisions;
- system-of-record authority binding.

## Twin diff

Every accepted change emits a semantic diff with:

- before/after;
- provenance;
- approver;
- effective date;
- affected jobs/graphs;
- affected integrations;
- affected network projections;
- affected entitlements/autonomy grants where applicable;
- re-certification/replay requirements.

## Rollback/correction

A bad learned rule must be reversible without erasing evidence. Correction creates a new version and preserves prior history.
