# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Zero-Call Analyzer Implementation & Two-Phase Execution Freeze v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE IMPLEMENTATION / EXECUTION FREEZE — AUTHORIZED

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Zero-Call Analyzer Controlling Execution Authorization v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Zero-Call Analyzer Metric / Denominator Pre-Registration v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Receipt-Only Analysis Ledger-Immutability & No-Replay Rule v0.1`, and the completed Stage-E 400-receipt provider-shadow execution result.

## 1. Exact implementation identities

- Analyzer path: `experiments/nss-stage-e-analysis/analyze.mjs`
- Analyzer Git blob SHA: `d52f13ff6b21ddfa5db48d8b71efefa7593da9df`
- Verifier path: `experiments/nss-stage-e-analysis/verify.mjs`
- Verifier Git blob SHA: `2d5b076c1a3582ea3a9534d5dfc71072205dc555`

Both implementations explicitly fail closed on provider/network execution by replacing `globalThis.fetch` with a throwing function.

## 2. Frozen input roots

- Provider evidence root: `/data/nss1-stage-e-provider-v0.1`
- Zero-call state/corpus root: `/data/nss1-stage-e-zero-call-v0.1`
- Derived analysis root: `/data/nss1-stage-e-analysis-v0.1`

The analysis root is separate from the original provider ledger and zero-call corpus roots.

## 3. Two-phase execution contract

Phase A — analyzer:

- reads only frozen Stage-E provider and zero-call evidence;
- verifies frozen root hashes and denominators;
- fingerprints the original provider ledger before and after analysis;
- computes reconstructable provider-disagreement, freshness, latency, usage, historical cost, and routing-economy metrics;
- records explicitly non-reconstructable metrics where frozen gold or definitions are absent;
- writes only derived artifacts under the analysis root;
- emits `NSS1_STAGE_E_ANALYSIS_WRITE_COMPLETE`;
- may not overwrite an existing `WRITE_STATE.json`.

Phase V — independent verifier:

- makes zero provider/network calls;
- re-hashes original inputs and derived artifacts;
- independently recomputes provider summaries, paired disagreement, and routing-economy outputs from the frozen receipts;
- confirms the original provider ledger fingerprint remains unchanged;
- confirms absent gold artifacts were not fabricated;
- emits `NSS1_STAGE_E_ANALYSIS_VERIFY_COMPLETE` with PASS or BLOCK;
- writes only analysis `VERIFICATION_RESULT.json` and `FREEZE_POINTER.json`.

## 4. Frozen evidence limitations

The Stage-E zero-call predecessor persisted event/state-machine evidence, QuestionSet, semantic attempts, provider matrix, terminal states, and provider receipts, but did not persist independent semantic gold, Need gold, work/disposition gold, accepted-work gold, a consequence-weight mapping, or a pre-execution known/novel classification layer.

Therefore the following remain pre-registered as `NOT_RECONSTRUCTABLE_FROM_FROZEN_EVIDENCE` unless a previously frozen artifact proving otherwise is discovered before execution:

- semantic accuracy;
- semantic accuracy by primitive/subtype;
- fresh/stale semantic accuracy;
- work/disposition accuracy;
- Need precision/recall;
- false-safe rate;
- false-escalation rate;
- consequence-weighted error;
- known-vs-novel performance;
- useful accepted work per Luna call;
- useful accepted work per inference dollar;
- calibration against semantic gold.

No new gold may be invented after receipt outcomes are known.

## 5. Reconstructable analysis surface

The implementation is authorized to reconstruct:

- 240 Luna / 160 Jev provider summaries;
- latency distributions;
- persisted token/usage fields where available;
- persisted historical execution cost fields;
- 160 exact Luna/Jev paired-event comparisons;
- Noul probability deltas without inventing a categorical threshold;
- Choice top-choice disagreement and transition matrices;
- Score expected-score deltas without inventing acceptance bands;
- disagreement by frozen family and fresh/stale status;
- control versus routed-candidate scheduling latency/cost;
- realized Luna suppression;
- control-to-candidate `work_response_class` transition counts as disagreement evidence, not correctness evidence.

## 6. No-post-hoc semantics

`DISAGREEMENT != ERROR`

`PROVIDER_OUTPUT != TRUTH`

`WORK_RESPONSE_DIFFERENCE != FALSE_SAFE`

`ANALYSIS_COMPLETENESS_PASS != ARCHITECTURE_PASS`

No architecture PASS is authorized without frozen semantic/work outcome ground truth sufficient to support that claim.

## 7. Execution authorization

`STAGE_E_ZERO_CALL_ANALYZER_PHASE_A=AUTHORIZED`

`STAGE_E_ZERO_CALL_ANALYZER_PHASE_V=AUTHORIZED_AFTER_PHASE_A_TERMINAL_WRITE`

`NEW_PROVIDER_CALLS=0`

`PROVIDER_REPLAY=PROHIBITED`

`ORIGINAL_PROVIDER_LEDGER_MUTATION=PROHIBITED`

`AUTHORITY_EFFECTS=NONE`

`PRODUCTION_PROMOTION=false`

## 8. Controlling transition

`CONTROLLING_NEXT_TRANSITION=EXECUTE_STAGE_E_ZERO_CALL_ANALYZER_PHASE_A`

If Phase A emits a clean terminal write state, the next transition is the exact frozen independent Phase-V verifier.

If either phase blocks, no provider execution or post-hoc data repair is authorized.