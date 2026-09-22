# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-A Zero-Call Causal Attribution Result v0.1

**Effective:** 2026-09-22  
**Provider calls made by this gate:** 0  
**Production promotion:** false  
**Authority effects:** none

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-A Execution Result Freeze v0.1` and all prior InterBraid / WorkforceOS / FreightOS / Semantic Computation Plane / Persistent Semantic Reflex Runtime / authority / evidence / provenance / tenant-isolation / security / Pass20 boundaries.

## Evidence closure verified

Direct read of the persistent Railway evidence volume established the final freeze pointer:

- `run_id=NSS1-STAGE-A-v0.1`
- `result_sha256=d8a460d990e1d55637f897b4850a4e8a8ab6b11e82b992635437fb2303f57231`
- `evidence_tree_sha256=947d733d3f662115ba104c6df167915ac018023fa611e92faec6fdb1fbfcbb8a`
- `corpus_sha256=5213178f40142b6673ebe0438b8e7a7651ab12639e399a8af97deb3ddff54b63`
- `source_plan_execution_manifest_sha256=3e06aff7c0347ea505b668b19e01407d00777773d1ef5e602c64ce6260dba1c1`
- `host_projection_execution_manifest_sha256=d0c9436d02bf121d378d241276ce8cdc2c56b38ca9bcdbefa77084c4d3404fbd`
- `authority_effects=NONE`

Receipt closure was independently reread from the volume:

- Arm A / Luna: `208`
- Arm B / Jev: `208`
- Arm C / Jev: `208`
- Arm C / Luna: `144`

No provider receipt was missing from the frozen denominator.

## Causal attribution

Using the frozen primitive gold and compiled-disposition outputs, every incorrect compiled disposition in all three arms coincided with one or more incorrect semantic primitive judgments.

Observed attribution:

- Arm A: `97` correct dispositions; `111` wrong with semantic error; `0` compiler-or-mapping-only errors.
- Arm B: `80` correct dispositions; `128` wrong with semantic error; `0` compiler-or-mapping-only errors.
- Arm C: `85` correct dispositions; `123` wrong with semantic error; `0` compiler-or-mapping-only errors.

Accordingly, within this corpus and compiler:

`PRIMARY_OBSERVED_ERROR_SOURCE=SEMANTIC_JUDGMENT`

`COMPILER_ONLY_ERROR_OBSERVED=0`

This does not prove the compiler is universally correct; it establishes only that compiler-only failure did not explain the observed Stage-A disposition errors.

## Arm C source attribution

Among Arm C's `123` wrong compiled dispositions, primitive-error source attribution was:

- Jev-routed primitive errors only: `104`
- Luna-routed primitive errors only: `3`
- both Jev and Luna primitive errors: `16`

Thus the dominant observed error surface in the current static routed policy lies in the primitives assigned to Jev. This is a routing-policy finding, not a universal provider-quality ranking.

## Primitive accuracy surfaces

### Luna full arm

- relevance Noul: `196/208 = 94.23%`
- material-state-change Noul: `183/208 = 87.98%`
- state-dimension Choice: `150/208 = 72.12%`
- need-exists Noul: `171/208 = 82.21%`
- continuity-severity Score: `132/208 = 63.46%`
- work-response-class Choice: `104/208 = 50.00%`
- external-authority-required Noul: `4/16 = 25.00%`

### Jev full arm

- relevance Noul: `176/208 = 84.62%`
- material-state-change Noul: `105/208 = 50.48%`
- state-dimension Choice: `160/208 = 76.92%`
- need-exists Noul: `160/208 = 76.92%`
- continuity-severity Score: `116/208 = 55.77%`
- work-response-class Choice: `100/208 = 48.08%`
- external-authority-required Noul: `16/16 = 100.00%`

These mixed surfaces reinforce that provider suitability is primitive/subtype/consequence dependent rather than scalar.

## Structured routing gains and losses

Relative to Luna monolith, routed Arm C produced:

- `37` events where Luna was correct and routed was wrong,
- `25` events where Luna was wrong and routed was correct,
- `60` events both correct,
- `86` events both wrong.

Major structured losses included:

- `minor_gps_update`: Luna `16/16`, routed `0/16`
- `malicious_instruction_distractor`: Luna `9/16`, routed `0/16`
- `in_flight_state_change`: Luna `6/16`, routed `0/16`

Major structured routed gains included:

- `wrong_load_pod`: Luna `0/16`, routed `8/16`
- `factor_assignment_change`: Luna `4/16`, routed `11/16`
- `mechanical_breakdown`: Luna `13/16`, routed `16/16`
- `irrelevant_advertisement`: Luna `13/16`, routed `16/16`

Therefore:

`STATIC_PRIMITIVE_ONLY_ROUTING=EMPIRICALLY_INADEQUATE`

`FAMILY_SUBTYPE_CONSEQUENCE_CAPABILITY_ROUTING=SUPPORTED_AS_NEXT_RESEARCH_DIRECTION`

## Controlling next transition

The next gate is an offline receipt-only counterfactual routing search over the already-frozen paired Luna/Jev receipts.

Requirements:

1. zero new provider calls;
2. train/holdout separation by synthetic load index;
3. candidate policies may use primitive, family/subtype, and consequence dimensions;
4. evaluate Luna-call suppression, Jev-call count, exact disposition accuracy, false-safe behavior, and provider-mix rate;
5. candidate discovery is exploratory only;
6. any confirmatory successor must precommit its routing policy and non-inferiority / safety gates before new inference;
7. OpenRouter and frontier models remain prohibited during this gate.
