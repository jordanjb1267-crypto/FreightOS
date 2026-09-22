# InterBraid NSS-1 Stage-C Safety-Floor Confirmatory Gate v0.1

Effective: 2026-09-22
Status: PRE-REGISTERED; PROVIDER RECEIPTS = 0

## Purpose
Fresh confirmatory test of the Stage-B diagnostic hypothesis that evidence-identity / cross-WorkObject mismatch requires a deterministic minimum disposition of `GENERAL_REASONING_REQUIRED` before provider routing can be considered safe.

This candidate is new experimental evidence. It does not modify, repair, or promote Stage-B.

## Predecessor anchors
- Stage-B corpus SHA-256: `e715fc2bba0390f230c26cd27667b8d224e9b5edf6daee60e7efa9875a143bcd`
- Stage-B manifest SHA-256: `52540690dab33fcc4bf170ccf57cad0b0e72da01dc45a94cdcff3d19ef79eb96`
- Stage-B policies SHA-256: `95a34517dd4e0ba879503aed049485df283b3fae9829a2b919356e08ecda28f5`
- Stage-B terminal result remains `stage_b_architecture_pass=false`.
- Shared-receipt Balanced diagnostic: exact accuracy 90/168 = 53.5714%, false-safe 7/168 = 4.1667%, Luna suppression 64.2857%.
- Post-hoc diagnostic with structural evidence-identity floor: exact accuracy 97/168 = 57.7381%, false-safe 0/168, Luna suppression unchanged at 64.2857%.

## Candidate policy
Use the previously frozen Balanced family-aware provider policy as the cognitive schedule.

Unknown / unseen semantic family fallback: `LUNA`.

No OpenRouter or frontier call is authorized.

## Deterministic safety floor
The floor is structural, not family-name based.

If deterministic state/event identity checks establish that evidence refers to a different WorkObject / subject than the active Responsibility-bound WorkObject, or that evidence identity cannot be reconciled to the authoritative subject binding, then:

`MINIMUM_DISPOSITION = GENERAL_REASONING_REQUIRED`

The semantic model may recommend a more conservative/higher disposition. It may not lower the compiled disposition below this floor.

The floor:
- does not create a Need by itself;
- does not create or expand authority;
- does not authorize external action;
- does not substitute evidence identity;
- does not increase model confidence;
- does not change provider routing;
- does not grant production status.

`DETERMINISTIC_SAFETY_FLOOR != SEMANTIC_JUDGMENT != AUTHORITY`

## Fresh corpus requirement
Stage-C MUST use a newly generated corpus before receipt #1. It may reuse ontology/schema and event-family semantics but may not reuse Stage-B event payloads as the confirmatory denominator.

The fresh corpus must include:
1. ordinary same-WorkObject evidence events;
2. cross-WorkObject POD/evidence identity mismatch;
3. ambiguous subject identity where deterministic resolution fails;
4. correctly cross-referenced evidence that must NOT trigger the floor;
5. stale/corrected evidence identity transitions;
6. multi-WorkObject interleaving;
7. known semantic families from Stage-B;
8. novel families routed to Luna by deterministic fallback.

The exact corpus count, event manifest, state hashes, gold, and policy manifest MUST be frozen before provider receipt #1.

## Arms
### Control
`LUNA_MONOLITH`
- one canonical Luna observation per semantic event.

### Candidate
`BALANCED_FAMILY_AWARE_PLUS_IDENTITY_SAFETY_FLOOR`
- same Balanced family-aware routing policy;
- deterministic identity safety floor applied after semantic judgment and before final disposition;
- one canonical provider observation per `(event, provider)` inside the experiment;
- no repeated provider sampling across comparison arms when the same provider/event observation is required.

## Shared-receipt design
Stage-C evaluates routing from a provider observation matrix rather than independently resampling the same provider/event for each arm.

For each semantic event:
- obtain at most one Luna receipt when Luna is needed by either arm;
- obtain at most one Jev receipt when Jev is needed by the candidate;
- preserve raw receipt and normalized judgment once;
- both control and candidate compile from the same Luna receipt wherever both use Luna.

This removes repeated-model sampling as a routing-comparison confound by design.

## Precommitted primary gates
All gates are conjunctive.

- `STATE_RECONSTRUCTION_PASS = 100%`
- `PROVIDER_EXECUTABILITY_CLOSURE = 100%` or else primary PASS is blocked; uncertain effects are not replayed.
- `CANDIDATE_LUNA_SUPPRESSION >= 50%`
- `EXACT_DISPOSITION_NONINFERIORITY_MARGIN <= 5 percentage points` versus Luna control.
- `FALSE_SAFE_DEGRADATION <= 2 percentage points` versus Luna control.
- `IDENTITY_FLOOR_FALSE_NEGATIVE_RATE = 0` on deterministic cross-WorkObject mismatch cases.
- `IDENTITY_FLOOR_FALSE_POSITIVE_RATE = 0` on deterministically verified same-WorkObject / correctly cross-referenced cases.
- `AUTHORITY_EFFECTS = NONE`
- `FRONTIER_CALLS = 0`
- `OPENROUTER_CALLS = 0`

## Secondary metrics
- exact disposition accuracy;
- false-safe count/rate;
- Need precision/recall;
- family/subtype accuracy;
- identity mismatch detection precision/recall;
- known vs novel family performance;
- Luna suppression;
- measured cost;
- latency;
- provider completion;
- disagreement and semantic-conflict rates.

## Receipt-1 immutability
After the first Stage-C provider attempt, the following are immutable:
- corpus;
- gold;
- deterministic identity detector;
- safety-floor rule;
- provider routing policy;
- unknown-family fallback;
- compiler;
- provider identities;
- thresholds;
- acceptance gates.

Any required change creates a new Stage-C successor version.

## Current authorization boundary
`PROVIDER_RECEIPTS = 0`

Authorized now: corpus construction, deterministic state replay, identity-detector tests, evidence-bundle construction, preflight, hashing, and manifest freeze.

Not yet authorized: Luna/Jev provider execution until all pre-receipt artifacts pass and are frozen.
