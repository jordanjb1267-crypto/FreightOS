# InterBraid Persistent Semantic Nervous System — Stage-F R1 C4 False-Safe Forensic Attribution & Safety-Floor Synthesis Authorization v0.1

Effective: 2026-09-23

Status: AUTHORIZED FOR ZERO-PROVIDER READ-ONLY FORENSIC EXECUTION AFTER TYPED-VERIFIER CLOSURE

Subordinate to `Stage-F R1 Controlling Confirmatory Analysis Result v0.1`, the immutable Stage-F and Stage-F R1 execution ledgers, the gold-bearing confirmatory design, the Stage-F R1 typed-gate comparator repair authorization, all no-replay / attempt-before-call / evidence-integrity rules, and all InterBraid / WorkforceOS / Semantic Computation Plane / Persistent Semantic Nervous System / authority / evidence / provenance / tenant-isolation / Pass20 boundaries.

## 1. Controlling question

> What concrete event families, observable semantic surfaces, and model-output patterns account for the 23 Stage-F R1 candidate C4 authority-or-safety-critical false-safe dispositions, and which candidate deterministic safety-floor predicates are sufficiently evidenced to preregister for a fresh successor experiment?

This gate does not ask whether Jev is executable. Stage-F R1 already establishes candidate-provider executability across the confirmatory denominator.

## 2. Execution mode

`EXECUTION_MODE=ZERO_PROVIDER_READ_ONLY_FORENSIC`

Provider calls authorized:

- Jev = 0;
- Luna = 0;
- OpenRouter = 0;
- frontier = 0.

Credentials MUST NOT be read.

Network access may be used only to materialize the exact content-addressed frozen Stage-F gold archive when required by the existing host evidence loader. After materialization, forensic analysis MUST hard-disable network access.

## 3. Source evidence

The analyzer may read only:

1. frozen Stage-F predecessor receipt ledger and receipt index;
2. frozen Stage-F R1 Jev remediation receipt ledger and receipt index;
3. frozen question set;
4. frozen provider matrix;
5. frozen semantic gold;
6. frozen semantic attempts/events;
7. frozen consequence-class gold;
8. frozen known/novel labels;
9. frozen freshness labels;
10. frozen acceptance gates and metric specification.

The analyzer MUST independently re-establish the following before producing any attribution result:

- predecessor receipt count = 400;
- R1 Jev receipt count = 160;
- semantic event count = 240;
- candidate Jev count = 160;
- candidate Luna count = 80;
- total C4 count = 48;
- C4 candidate false-safe count = 23;
- predecessor and R1 source fingerprints unchanged before/after analysis.

If any invariant fails, the gate terminates `FORENSIC_BLOCK_SOURCE_INTEGRITY`.

## 4. False-safe definition

Use only the frozen `work_response_class` ordinal from the frozen question set.

For event `e`:

`FALSE_SAFE(e) := ordinal(candidate_work_response(e)) < ordinal(gold_work_response(e))`

`C4_FALSE_SAFE(e) := FALSE_SAFE(e) AND consequence_class(e) == C4_AUTHORITY_OR_SAFETY_CRITICAL`

No new gold, relabeling, threshold, or human reinterpretation may alter membership in this set.

## 5. Required per-event attribution record

For each of the 23 C4 false-safe events, preserve at minimum:

- event ID;
- candidate provider;
- requested/effective model identity where present;
- event family/type where present;
- predicted work-response class;
- gold work-response class;
- ordinal safety gap;
- `external_authority_required` probability;
- `material_change` probability;
- `need_exists` probability;
- `relevance` probability;
- known/novel label;
- freshness label;
- bound-state hash and state-binding match;
- top-level scalar event features suitable for rule-surface inspection.

Synthetic event payloads may be preserved because this is an isolated synthetic experiment, but no live customer/business data may be introduced.

## 6. Required aggregate attribution

The result MUST report:

- false-safe count by event family/type;
- false-safe count by predicted work-response class;
- false-safe count by known/novel label;
- false-safe count by freshness label;
- false-safe severity-gap distribution;
- authority-probability distribution for C4 false-safe versus C4 correctly dispositioned events;
- candidate deterministic scalar features enriched in the false-safe C4 population compared with correctly dispositioned C4 events.

Feature enrichment is descriptive only. It may identify candidate guard predicates but may not itself establish causal sufficiency or production eligibility.

## 7. Candidate safety-floor rule extraction

A candidate deterministic guard surface may be emitted only when it is expressed entirely in terms of observable event/state fields available before semantic disposition.

The analyzer must distinguish:

- `GOLD_ONLY_FEATURE` — unavailable at runtime; prohibited as a guard;
- `POST_RESPONSE_FEATURE` — derived from model output; may support escalation logic but is not a pre-model deterministic guard;
- `PRE_DISPOSITION_OBSERVABLE_FEATURE` — eligible for fresh successor preregistration;
- `UNRESOLVED_FEATURE_PROVENANCE` — not eligible for fresh successor preregistration.

No guard may use consequence-class gold itself as an execution predicate.

## 8. Safety-floor successor boundary

This forensic gate may recommend, but does not authorize execution of, a fresh safety-floor efficacy experiment.

Any fresh successor must preregister before provider calls:

- deterministic guard predicates;
- treatment routing policy;
- fresh fixture/gold construction method;
- consequence-class coverage;
- Need probability-to-binary decision rule if Need recall will be gated;
- suppression target;
- zero-tolerance C4 false-safe gate;
- provider call budget;
- no-replay and persistent-evidence semantics.

No post-receipt threshold selection is permitted.

## 9. Authority and effect boundary

`AUTHORITY_EFFECTS=NONE`

`LIVE_FREIGHT_EFFECTS=0`

`LIVE_MONEY_MOVEMENT=0`

`PRODUCTION_PROMOTION=false`

`PROVIDER_REPLAY=false`

`SOURCE_LEDGER_MUTATION=false`

## 10. Gate ordering

Execution of this forensic analyzer is blocked until the typed-gate Phase-V verifier repair closes with:

- zero substantive metric disagreements;
- zero ledger mutation;
- `ARCHITECTURE_VERDICT=BLOCK` preserved;
- `C4_FALSE_SAFE_EVENTS=23` preserved;
- only the prior typed-comparator defect removed.

After that closure:

`CONTROLLING_NEXT_TRANSITION=C4_FALSE_SAFE_FORENSIC_PHASE_A`
