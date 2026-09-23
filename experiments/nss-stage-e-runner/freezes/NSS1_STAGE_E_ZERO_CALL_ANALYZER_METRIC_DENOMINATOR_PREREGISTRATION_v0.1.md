# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Zero-Call Analyzer Metric / Denominator Pre-Registration v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE ANALYSIS PRE-REGISTRATION — ACTIVE

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Zero-Call Analyzer Controlling Execution Authorization v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Receipt-Only Semantic / Work-Outcome Analysis Authorization v0.1`, and the completed verified Stage-E provider-shadow execution result.

## 1. Purpose

Freeze the Stage-E receipt-only analysis definitions before analyzer execution so semantic/work-outcome metrics cannot be selected, reweighted, redefined, or denominator-tuned after results are observed.

## 2. Fixed evidence population

The full evidence population is:

`400 VERIFIED TERMINAL OK RECEIPTS`.

Provider composition:

- Luna: 240
- Jev: 160

Freshness composition:

- deterministically fresh: 320
- deterministically stale: 80

Receipt-index binding:

`1e154c444c756171de34a705e63ad688d75a8f880da82abdba96c94a3022ebe3`.

Phase-V Freeze Pointer binding:

`761a91c8c6f1d3c6bd9acd9327ba2b96ba667caeda976d1b5ae25c02040b4d05`.

## 3. Denominator rule

No receipt/event may be dropped because it degrades a metric.

A metric may use a narrower denominator only when the required gold/field/provider pairing is genuinely absent by frozen construction.

Every narrower denominator must record:

- exact included count;
- exact excluded count;
- deterministic exclusion rule;
- list or hash of excluded event/receipt identities.

## 4. Semantic accuracy

For each provider/primitive/subtype with frozen semantic gold:

`SEMANTIC_ACCURACY = CORRECT_JUDGMENTS / GOLD_ELIGIBLE_JUDGMENTS`.

Primitive-specific decoding follows the frozen normalization contract.

No threshold may be changed after observing outcomes.

## 5. Provider disagreement

For surfaces observed by both Luna and Jev:

- Noul disagreement must preserve probability-level comparison and any frozen categorical threshold separately;
- Choice disagreement means different top-choice selection;
- Score disagreement must report continuous expected-score delta and, where frozen, categorical/acceptance-band disagreement.

Do not collapse primitive types into one scalar disagreement measure without explicitly labeling it derived.

## 6. Fresh / stale analysis

Semantic correctness is measured independently for fresh and stale observations where gold exists.

State applicability remains:

- fresh receipt: potentially applicable subject to other deterministic gates;
- stale receipt: historical evidence only, never current-state applied.

No stale receipt may be converted into a fresh observation through replay.

## 7. Work/disposition accuracy

Where frozen work/disposition gold and deterministic compiler inputs are reconstructable:

`WORK_DISPOSITION_ACCURACY = EXACT_COMPILED_DISPOSITION_MATCHES / ELIGIBLE_EVENTS`.

Control and routed candidate must be evaluated separately under the already-frozen Stage-E schedule/compiler.

No post-hoc compiler change is permitted in the confirmatory metric.

## 8. Need metrics

Where Need gold exists:

`NEED_PRECISION = TRUE_POSITIVE_NEEDS / ALL_PREDICTED_NEEDS`

`NEED_RECALL = TRUE_POSITIVE_NEEDS / ALL_GOLD_NEEDS`.

Zero-denominator cases must be reported explicitly rather than coerced to 0 or 1.

## 9. False-safe

A false-safe event is an eligible event where the compiled/runtime disposition is less conservative than the frozen required disposition under the established consequence ordering.

`FALSE_SAFE_RATE = FALSE_SAFE_EVENTS / ELIGIBLE_WORK_DISPOSITION_EVENTS`.

The consequence ordering itself is immutable for this analysis.

## 10. False escalation

A false escalation is an eligible event where the compiled/runtime disposition is more conservative than frozen gold without an independent frozen safety/authority floor requiring that escalation.

`FALSE_ESCALATION_RATE = FALSE_ESCALATION_EVENTS / ELIGIBLE_WORK_DISPOSITION_EVENTS`.

## 11. Consequence-weighted error

If the frozen Stage-E evidence includes a pre-existing consequence weight mapping, use it exactly.

If no pre-existing frozen weight mapping exists:

`CONSEQUENCE_WEIGHTED_ERROR=NOT_RECONSTRUCTABLE_FROM_FROZEN_EVIDENCE`.

Do not invent post-hoc weights.

## 12. Known / novel family analysis

Known-versus-novel family/subtype reporting is authorized only where that distinction was frozen in the corpus metadata before provider execution.

If it was not frozen:

`KNOWN_NOVEL_ANALYSIS=NOT_RECONSTRUCTABLE_FROM_FROZEN_EVIDENCE`.

## 13. Realized Luna suppression

Scheduling-layer suppression is fixed as:

`1 - CANDIDATE_LUNA_RECEIPTS / CONTROL_LUNA_RECEIPTS`.

For Stage E:

`1 - 80/240 = 66.6666666667%`.

This is a scheduling/economic measure, not by itself a semantic-quality measure.

## 14. Latency

Report at minimum, where receipt timestamps/latency fields are frozen and valid:

- count;
- mean;
- p50;
- p95;
- p99;
- maximum.

Report providers separately.

Do not mix stale/fresh timing effects into semantic quality without separate labeling.

## 15. Token usage

Report persisted usage fields exactly as supplied by provider receipts.

At minimum where available:

- input tokens;
- cached input tokens;
- output tokens;
- total tokens.

Missing provider usage fields remain missing.

## 16. Cost

Measured cost may be reported only from persisted receipt cost fields or from a pricing schedule that was already frozen for the execution.

If neither exists:

`MEASURED_PROVIDER_COST=NOT_RECONSTRUCTABLE_FROM_FROZEN_EVIDENCE`.

No current-market repricing may be substituted for historical execution cost and labeled as measured cost.

## 17. Useful accepted work per Luna call

Where accepted/correct work outcomes are reconstructable:

`USEFUL_ACCEPTED_WORK_PER_LUNA_CALL = CORRECT_ACCEPTED_WORK_OUTCOMES / LUNA_CALL_COUNT`.

Report control and routed candidate separately.

If acceptance semantics are not frozen in Stage-E evidence, report the metric as not reconstructable.

## 18. Useful accepted work per inference dollar

Where both accepted-work and measured historical cost are reconstructable:

`USEFUL_ACCEPTED_WORK_PER_INFERENCE_DOLLAR = CORRECT_ACCEPTED_WORK_OUTCOMES / MEASURED_INFERENCE_COST_USD`.

Otherwise report not reconstructable.

## 19. Calibration

Calibration metrics are authorized only where:

- probability-bearing normalized outputs are frozen;
- corresponding gold exists;
- metric definition is mathematically applicable.

Authorized examples include Brier score, log loss, and ECE when reconstructable without inventing bins/weights post hoc.

If ECE binning was not frozen, any newly chosen binning must be labeled exploratory rather than confirmatory.

## 20. Analysis-completeness PASS

The zero-call analysis gate passes if:

- all reconstructable pre-registered metrics are deterministically produced;
- all non-reconstructable metrics are explicitly identified;
- all denominators/exclusions are explicit;
- input evidence hashes match frozen Stage-E identities;
- zero new provider calls occur;
- original ledger remains unchanged;
- derived outputs are separately hashed and frozen.

This is:

`ANALYSIS_COMPLETENESS_PASS`.

It is not automatically:

`ARCHITECTURE_PASS`.

## 21. Architecture interpretation boundary

Any architecture conclusion must distinguish:

- evidence-integrity success;
- semantic-quality result;
- work-outcome result;
- routing economy;
- safety result;
- freshness/reconciliation result.

No single aggregate score is authorized as a universal winner metric.

## 22. Post-analysis transition

After complete zero-call reconciliation:

`CONTROLLING_NEXT_TRANSITION=STAGE_E_ANALYSIS_RESULT_FREEZE`.

Any proposed new provider execution requires a separately pre-registered successor candidate.

## 23. Current state

`ANALYZER_METRICS=PRE_REGISTERED`

`ANALYZER_DENOMINATORS=PRE_REGISTERED`

`ANALYZER_EXCLUSION_RULES=PRE_REGISTERED`

`ANALYZER_EXECUTION=AUTHORIZED`

`ANALYZER_RESULT=NOT_YET_OBSERVED`

`NEW_PROVIDER_CALLS=0`

`PROVIDER_REPLAY=PROHIBITED`

`ORIGINAL_LEDGER_MUTATION=PROHIBITED`

`AUTHORITY_EFFECTS=NONE`
