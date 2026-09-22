# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Forensic v0.1 Fail-Closed Verifier-Defect Result v0.1

**Effective:** 2026-09-22  
**Status:** CANONICAL ADDITIVE FORENSIC-EVIDENCE STATE — BLOCKED VERIFIER, ORIGINAL EXECUTION BYTES PRESERVED

Subordinate to all prior NSS-1 Stage-C freezes, including the zero-call/execution-manifest result, provider-execution/evidence-closure interruption result, and existing-bytes forensic recovery authorization.

## 1. Controlling result

`NSS1_STAGE_C_FORENSIC_V0_1=BLOCK`

`BLOCK_CLASS=FORENSIC_VERIFIER_DEFECT`

`STAGE_C_RECOMPUTED_ARCHITECTURE_RESULT=PASS_UNPROMOTED`

`PROVIDER_CALLS_DURING_FORENSIC=0`

`PROVIDER_REPLAY=false`

`ORIGINAL_EXECUTION_TREE_MUTATED=false`

The first existing-bytes forensic pass deliberately failed closed despite recovering a complete provider denominator and independently recomputing a Stage-C PASS. The PASS is not promoted by this freeze because the forensic verifier itself reported mismatches that must be resolved without changing the original execution bytes or issuing provider calls.

## 2. Independently recovered execution evidence

Execution manifest:

`15a62008591e458748376e1b6edc21d6594b3dea5974fdf2e3b1300faa22e032`

Original crash-state tree:

`a1634303eb6cda0bc8c4e6c963dfef69cc5ee0481ca16002e2b8edd27db3f5e1`

Original file count: `832`

Original final Freeze Pointer present: `false`

Expected receipts:
- Luna: `168`
- Jev: `108`
- Total: `276`

Persisted receipts:
- Luna: `168`
- Jev: `108`
- Total: `276`

Persisted attempts:
- Luna: `168`
- Jev: `108`

Raw provider response files:
- Luna: `168`
- Jev: `108`

Raw-response hash verification:
- checked: `276`
- hash matches: `276`
- missing: `0`
- unexpected: `0`

Receipt status closure:
- Luna `OK`: `168/168`
- Jev `OK`: `108/108`

Provider/model identity closure:
- Luna: `gpt-5.6-luna => gpt-5.6-luna`, `168/168`
- Jev: `jev-latest => jev-1.13.0`, `108/108`

## 3. Independently recomputed Stage-C metrics

### Luna control
- events: `168`
- usable: `168`
- correct: `67`
- accuracy: `0.39880952380952384` (`39.880952%`)
- false-safe: `52`
- false-safe rate: `0.30952380952380953` (`30.952381%`)
- provider unavailable: `0`
- recorded cost: `$0.17072999999999985`

### Routed candidate + structural safety floor
- events: `168`
- usable: `168`
- correct: `97`
- accuracy: `0.5773809523809523` (`57.738095%`)
- false-safe: `13`
- false-safe rate: `0.07738095238095238` (`7.738095%`)
- provider unavailable: `0`
- recorded cost: `$0.06628032200000002`
- Luna suppression: `0.6428571428571428` (`64.285714%`)
- independently recomputed safety-floor applications: `16`

Deltas versus Luna control:
- accuracy: `+17.85714285714285` percentage points
- false-safe rate: `-23.214285714285715` percentage points

Pre-registered gates recomputed true:
- provider executability closure
- exact noninferiority
- false-safe degradation
- Luna suppression
- identity floor
- state reconstruction
- authority effects `NONE`
- OpenRouter calls `0`
- frontier calls `0`

Thus `STAGE_C_RECOMPUTED_ARCHITECTURE_RESULT=PASS`, but promotion is withheld pending corrected forensic closure.

## 4. Why forensic v0.1 blocked

Two verifier-assumption defects explain the reported mismatch set:

1. `QUESTION_ID_ORDER_ASSUMPTION` — the verifier compared receipt question IDs to `Object.keys()` from a canonicalized persisted plan using array-order equality. Canonical JSON serialization sorts object keys; runtime receipt arrays preserve the original question insertion order. Question identity must therefore be checked as an exact set/multiset, not as order-sensitive sequence, because order was not a semantic part of the frozen QuestionSet contract.

2. `CANDIDATE_RESULT_SHAPE_ASSUMPTION` — the verifier compared `CANDIDATE_RESULT.json.metrics` against aggregate-only fields (`luna_suppression`, `safety_floor_applications`) that were written in aggregate `RESULT.json`, not in the narrower candidate metrics artifact. The correct forensic comparison must respect each persisted artifact's actual frozen schema rather than requiring fields it never contained.

These are forensic-reader defects. They do not authorize changing corpus, gold, provider receipts, normalized judgments, routing, safety-floor behavior, metrics, thresholds, or the original execution result.

## 5. Failed forensic v0.1 evidence identities

`FORENSIC_V0_1_ORIGINAL_ARTIFACT_INDEX_SHA256=f36d6112f7671b7c74453fcca7a70f3eef6af1f2cce999bd4c6e2befa2487c04`

`FORENSIC_V0_1_RESULT_SHA256=b52ee83a79a0e5a6ab6bc127afd89f3014abd378457342ff1ce80762fb8f4d50`

`FORENSIC_V0_1_FREEZE_POINTER_SHA256=2e7d9a04d4d9ce5aca9c538969c54524e997d145971ebe4d3018bc2d25f3dd6b`

`FORENSIC_V0_1_READBACK_PASS=true`

The failed forensic candidate is retained as immutable forensic-process evidence and must not be rewritten to appear as a PASS.

## 6. Successor authorization

Authorize `NSS1_STAGE_C_FORENSIC_V0_2` with exactly two verifier-semantic corrections:

- compare question IDs by sorted exact identity set rather than runtime insertion order;
- compare `CANDIDATE_RESULT.json` only to the base candidate metrics it actually persisted, while separately comparing aggregate suppression and floor-application fields against `RESULT.json`.

No other verifier weakening or experiment change is authorized.

`PROVIDER_CALLS_V0_2=0`

`PROVIDER_REPLAY_V0_2=PROHIBITED`

`ORIGINAL_EXECUTION_BYTES=IMMUTABLE`

`CONTROLLING_NEXT_TRANSITION=RUN_CORRECTED_EXISTING_BYTES_FORENSIC_V0_2`
