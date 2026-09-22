# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-A Zero-Call Counterfactual Family Routing Search Result v0.1

**Effective:** 2026-09-22  
**Provider calls made by this gate:** 0  
**Result class:** exploratory receipt-replay evidence  
**Production promotion:** false  
**Authority effects:** none

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-A Zero-Call Causal Attribution Result v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-A Execution Result Freeze v0.1`, the Railway host-projection freeze, the C001 source-plan freezes, and all prior InterBraid / WorkforceOS / FreightOS / Semantic Computation Plane / Persistent Semantic Reflex Runtime / TypeSafe-Jev / authority / evidence / provenance / tenant-isolation / security / Pass20 / Owner-controlled assurance state.

## 1. Frozen evidence basis

No new semantic inference occurred. The search used only the already-frozen paired Luna/Jev Stage-A receipts.

Frozen evidence pointer:

- `run_id=NSS1-STAGE-A-v0.1`
- `result_sha256=d8a460d990e1d55637f897b4850a4e8a8ab6b11e82b992635437fb2303f57231`
- `evidence_tree_sha256=947d733d3f662115ba104c6df167915ac018023fa611e92faec6fdb1fbfcbb8a`
- `corpus_sha256=5213178f40142b6673ebe0438b8e7a7651ab12639e399a8af97deb3ddff54b63`
- `source_plan_execution_manifest_sha256=3e06aff7c0347ea505b668b19e01407d00777773d1ef5e602c64ce6260dba1c1`
- `host_projection_execution_manifest_sha256=d0c9436d02bf121d378d241276ce8cdc2c56b38ca9bcdbefa77084c4d3404fbd`

## 2. Search design

Policy class: exactly one semantic provider per semantic event family; no per-question provider mixing and no frontier/OpenRouter lane.

- semantic event families: 13
- candidate policies: `2^13 = 8,192`
- policy-discovery split: synthetic load indices 1–8 (`104` semantic events)
- untouched holdout split: synthetic load indices 9–16 (`104` semantic events)
- train Pareto frontier size: 8

Metrics:

- exact compiled-disposition accuracy,
- false-safe count/rate,
- Luna calls,
- Jev calls,
- Luna-call suppression relative to Luna monolith,
- family-level behavior,
- paired correctness relative to Luna monolith.

## 3. Baselines

### All-Luna

Train:
- correct: `53/104`
- accuracy: `50.9615%`
- false-safe: `26/104`
- false-safe rate: `25.0000%`
- Luna calls: 104

Holdout:
- correct: `44/104`
- accuracy: `42.3077%`
- false-safe: `28/104`
- false-safe rate: `26.9231%`
- Luna calls: 104

### All-Jev

Train:
- correct: `40/104`
- accuracy: `38.4615%`
- false-safe: `25/104`
- false-safe rate: `24.0385%`
- Luna calls: 0

Holdout:
- correct: `40/104`
- accuracy: `38.4615%`
- false-safe: `25/104`
- false-safe rate: `24.0385%`
- Luna calls: 0

### Original static routed Arm C

Train:
- correct: `43/104`
- accuracy: `41.3462%`
- false-safe rate: `21.1538%`

Holdout:
- correct: `42/104`
- accuracy: `40.3846%`
- false-safe rate: `23.0769%`

## 4. Balanced family-aware candidate — mask 7174

Policy:

- irrelevant_advertisement → Jev
- minor_gps_update → Luna
- appointment_material_change → Luna
- contradictory_facility_evidence → Jev
- mechanical_breakdown → Jev
- detention_threshold_crossed → Jev
- pod_arrival → Jev
- wrong_load_pod → Jev
- invoice_after_pod → Jev
- factor_assignment_change → Jev
- reconciliation_success → Luna
- in_flight_state_change → Luna
- malicious_instruction_distractor → Luna

Train:
- correct: `60/104`
- accuracy: `57.6923%`
- false-safe: `14/104`
- false-safe rate: `13.4615%`
- Luna calls: 40
- Jev calls: 64
- Luna suppression: `61.5385%`

Holdout:
- correct: `55/104`
- accuracy: `52.8846%`
- false-safe: `14/104`
- false-safe rate: `13.4615%`
- Luna calls: 40
- Jev calls: 64
- Luna suppression: `61.5385%`

Paired against Luna on holdout:
- family policy only correct: 11
- Luna only correct: 0
- both correct: 44
- both wrong: 49

Thus this candidate improved exact disposition correctness and false-safe behavior on the untouched load-index holdout while reducing Luna calls by more than 60%.

## 5. Lower-Luna frontier candidate — mask 7170

Policy differs from mask 7174 by routing `appointment_material_change` to Jev rather than Luna.

Train:
- correct: `59/104`
- accuracy: `56.7308%`
- false-safe: `14/104`
- false-safe rate: `13.4615%`
- Luna calls: 32
- Jev calls: 72
- Luna suppression: `69.2308%`

Holdout:
- correct: `55/104`
- accuracy: `52.8846%`
- false-safe: `14/104`
- false-safe rate: `13.4615%`
- Luna calls: 32
- Jev calls: 72
- Luna suppression: `69.2308%`

This policy matched mask 7174's holdout accuracy and false-safe rate using eight fewer Luna calls. Because this observation uses the holdout result, it is exploratory and cannot itself authorize confirmatory promotion.

## 6. Aggressive suppression candidate — mask 4098

Policy routes only `minor_gps_update` and `malicious_instruction_distractor` to Luna; all other semantic families route to Jev.

Train:
- correct: `55/104`
- accuracy: `52.8846%`
- false-safe: `17/104`
- false-safe rate: `16.3462%`
- Luna calls: 16
- Luna suppression: `84.6154%`

Holdout:
- correct: `50/104`
- accuracy: `48.0769%`
- false-safe: `17/104`
- false-safe rate: `16.3462%`
- Luna calls: 16
- Luna suppression: `84.6154%`

Paired against Luna on holdout:
- family policy only correct: 11
- Luna only correct: 5
- both correct: 39
- both wrong: 49

## 7. Key empirical advancement

The Stage-A evidence now distinguishes two propositions:

1. **Primitive-only static routing was inadequate.**
2. **Family/subtype-aware cognitive scheduling is strongly supported as a successor design.**

The receipt-replay evidence demonstrates that the same two providers can be allocated differently such that, on the held-out synthetic loads, the routed policy simultaneously:

- reduces Luna usage,
- improves exact work/disposition correctness,
- and reduces false-safe behavior.

Therefore the controlling architectural refinement is:

`COGNITIVE_SCHEDULING_ROUTE_KEY = SEMANTIC_CONTRACT × DOMAIN_EVENT_FAMILY_OR_SUBTYPE × CONSEQUENCE × PROVIDER_CAPABILITY`

and not merely:

`COGNITIVE_SCHEDULING_ROUTE_KEY = PRIMITIVE × CONFIDENCE`.

## 8. Important limitation

This remains exploratory evidence.

The holdout split is untouched by the policy-selection routine, but both train and holdout arise from the same synthetic C001 generator, share the same thirteen semantic families, and use repeated family structure across load indices. The evidence therefore does not establish generalization to fresh event generation, paraphrase distributions, new freight states, new family variants, or unknown event families.

No claim of confirmatory nervous-system success is authorized from this result alone.

## 9. Controlling next transition

The next gate is a **fresh-corpus confirmatory family-aware routing trial** with policy and acceptance criteria frozen before receipt #1.

The confirmatory trial must:

1. use fresh event generation and unseen perturbations rather than C001 load replicas;
2. precommit the candidate routing policy/policies before any inference;
3. include a Luna-monolith paired control;
4. preserve deterministic state reconstruction and authority isolation;
5. precommit non-inferiority/safety/suppression gates;
6. use an explicit fallback for unknown/unclassified event families;
7. keep OpenRouter/frontier calls at zero unless separately authorized;
8. separately flag families where both Luna and Jev remain poor so routing is not mistaken for semantic-contract repair.

`NEXT_GATE=NSS1_STAGE_B_FRESH_CORPUS_CONFIRMATORY_FAMILY_AWARE_ROUTING`
