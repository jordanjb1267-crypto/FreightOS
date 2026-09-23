# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-D Provider Runner Zero-Receipt Execution Preflight Result v0.1

**Effective:** 2026-09-22  
**Status:** CANONICAL ADDITIVE PRE-RECEIPT RESULT — PASS

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-D Multi-Event Trajectory Provider Execution Pre-Receipt Authorization v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-D Multi-Event Trajectory Zero-Call Preflight Result v0.1`, and all prior controlling InterBraid / NSS assurance state.

## 1. Controlling result

`NSS1_STAGE_D_PROVIDER_RUNNER_PREFLIGHT=PASS`

`PROVIDER_RECEIPTS=0`

`PROVIDER_RECEIPT_1_NOT_YET_CROSSED=true`

`AUTHORITY_EFFECTS=NONE`

`OPENROUTER_CALLS=0`

`FRONTIER_CALLS=0`

The exact provider runner independently re-read the frozen Stage-D evidence bundle from durable `/data`, reproduced the zero-call execution identity, validated the semantic denominator and provider matrix, and emitted its own execution-manifest identity without calling a provider.

## 2. Frozen identities

- Stage-D zero-call execution manifest: `c3a71af59725f7772969763d3131c8e738b880c9751370f10d411678967f83bf`
- Stage-D zero-call Freeze Pointer: `05f00284f4db2ba5a15b93321ede945a809b4852d25f5e84bc60dbc128acd610`
- Stage-D provider-runner execution manifest: `ab9c426a23d04916d7088ee768a5f8a024afd97ca523cf248e224b164b639090`
- QuestionSet SHA-256: `1afe35c7553dcd2c37fe11e114501b83388121e17e891bf4e2d08d39d489bc06`
- Routing/provider matrix SHA-256: `457e7831b6aafe00d45a6d3e4006b2252ab2df28c6908b0260e3c2fe9b67dd41`
- Provider runner implementation commit: `189bceeeecebcb9ab7adfb7a2319eabf82343921`
- Railway preflight deployment: `4dc3002b-7bf0-4019-8fbf-6bfd43f3d63f`

## 3. Exact execution matrix

- trajectories: `24`
- total events: `288`
- semantic events: `192`
- Luna control receipts scheduled: `192`
- routed candidate Luna events: `64`, sharing the corresponding Luna-control receipt
- routed candidate Jev receipts scheduled: `128`
- total distinct provider attempts: `320`
- planned candidate Luna suppression: `66.66666666666667%`

`STATE_BINDING_PASS=true`

`PROVIDER_MATRIX_PASS=true`

## 4. Receipt-1 immutability rule

After provider receipt #1, the following are immutable for this candidate:

- corpus and trajectory ordering;
- transition oracle and frozen gold;
- QuestionSet instructions, criteria, labels, and score semantics;
- provider assignments;
- model identity expectations;
- result compiler;
- structural safety floors;
- fresh-state applicability rule;
- provider-attempt and uncertain-orchestration rules;
- metric definitions;
- paired-coverage rule;
- all PASS/BLOCK thresholds frozen in the pre-receipt authorization.

No post-hoc threshold, route, gold, compiler, or safety-floor change may repair this candidate in place.

## 5. Controlling next transition

`CONTROLLING_NEXT_TRANSITION=CROSS_STAGE_D_PROVIDER_RECEIPT_1_ON_EXACT_RUNNER_MANIFEST_AB9C426A`

The only authorized execution change is `RUN_MODE=execute` on the exact runner implementation and evidence root that produced this preflight result.

No production authority, external freight effect, money movement, brokerage/dispatch action, OpenRouter call, or frontier call is authorized.
