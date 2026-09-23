# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Provider Receipt-1 Controlling Transition & Immutability Rule v0.1

**Effective:** 2026-09-22  
**Status:** CANONICAL ADDITIVE CONTROL-STATE RULE — ACTIVE

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Provider Shadow Execution Authorization v0.1`, `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Pre-Receipt Execution Manifest & Provider Runner Preflight Result v0.1`, and all prior Stage-F / Stage-E / NSS / Semantic Computation Plane / authority / evidence / provenance / tenant-isolation / provider-substitution / security / Pass20 assurance state.

## 1. Controlling transition

The controlling next transition is now:

`STAGE_F_PROVIDER_SHADOW_PHASE_W_EXECUTION`.

No additional design, routing, threshold, model-selection, corpus, gold, metric, or preflight gate may supersede this transition once the execute entry validates the exact authorization artifact.

Receipt #1 may be crossed only under the exact authorization boundary frozen in `STAGE_F_PROVIDER_SHADOW_EXECUTION_AUTHORIZATION_v0.1.md`.

## 2. Exact controlling identities

The execution candidate is defined by:

- runner execution manifest: `5f068643ca73307f363cfc2aa4f616e68fd23df5ba372f1f3017f0cfe54a1e85`
- preflight Freeze Pointer: `bab19728324ef85a08575c171a986f62cdbd6713ba8cda116be67c0ad44c61d6`
- verified Stage-F evidence archive: `b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8`
- provider matrix: `8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8`
- QuestionSet: `0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb`
- acceptance gates: `aa121991d20f06c301f65e263bf3bca692142e7929ecc8c854fdfbb0bbf24efb`.

Any mismatch means:

`EXECUTION_CANDIDATE_IDENTITY_MISMATCH=BLOCK`.

## 3. Exact provider schedule

Frozen denominator:

- control Luna: `240`
- candidate shared Luna: `80`
- candidate Jev: `160`
- distinct provider attempts: `400`
- planned Luna suppression: `66.6666666667%`.

The 80 candidate Luna observations reuse the corresponding canonical Luna control observations.

There is no second independent Luna sample for those events.

## 4. Provider identities

Luna:

`requested=gpt-5.6-luna`

`required_effective=gpt-5.6-luna`.

Jev:

`requested=jev-latest`

`required_effective=jev-1.13.0`.

Provider substitution is prohibited.

## 5. Receipt-1 lock

The moment the first provider attempt is persisted as `STARTED`:

`STAGE_F_RECEIPT_1_CROSSED=true`.

At that instant, all candidate-defining inputs become immutable.

The following are prohibited after receipt #1:

- corpus mutation;
- state-graph mutation;
- semantic/Need/work/consequence/freshness gold mutation;
- known/novel reclassification;
- QuestionSet mutation;
- routing-policy mutation;
- provider-matrix mutation;
- provider identity substitution;
- provider-adapter semantic changes;
- execution-manifest mutation;
- metric-definition mutation;
- acceptance-gate mutation;
- consequence-weight mutation;
- denominator repair;
- deletion/reclassification of inconvenient receipts;
- evidence-semantic mutation intended to recover PASS.

A material change requires a new successor candidate and may not be represented as continuation of Stage F.

## 6. No-replay rule

Attempt state is effect-sensitive.

`STARTED + NO_TERMINAL_RECEIPT = ORCHESTRATION_UNCERTAIN`.

An uncertain attempt is evidence.

It is not authorization to retry.

Automatic replay is prohibited.

A later reconciliation may establish external non-effect only under a separately frozen process; absent that proof, the original attempt stays unresolved in the denominator.

## 7. Freshness rule

Every provider receipt is permanently bound to the state SHA-256 against which it was requested.

If authoritative state advances before result application:

`RECEIPT_VALID_AS_HISTORICAL_EVIDENCE=true`

but:

`CURRENT_STATE_APPLICATION=false`.

No stale receipt may be converted into a fresh receipt through relabeling, replay, or state-history rewriting.

## 8. Authority rule

All model output remains shadow evidence only.

`MODEL_OUTPUT != AUTHORITY`.

`SEMANTIC_CORRECTNESS != EXECUTION_AUTHORIZATION`.

`AUTHORITY_EFFECTS=NONE` is mandatory.

No provider result may authorize live dispatch, booking, freight mutation, payment/value movement, credential use, production signing, external-counterparty action, or production state mutation.

## 9. Platform-status rule

Infrastructure states do not substitute for experiment states.

`BUILD_SUCCESS != PROVIDER_EXECUTION_COMPLETE`.

`DEPLOYMENT_SUCCESS != PROVIDER_EXECUTION_COMPLETE`.

`CONTAINER_RUNNING != PROVIDER_EXECUTION_COMPLETE`.

`PLANNED_400_CALLS != VERIFIED_400_RECEIPTS`.

Only application-owned Phase-W terminal evidence may close provider execution.

## 10. Phase-W terminal states

Permitted terminal classifications are:

### WRITE_COMPLETE_UNVERIFIED

Exactly the frozen attempt/receipt ledger has been written and awaits independent Phase-V verification.

### BLOCK

The runner detects a frozen-gate violation, model-identity violation, evidence-integrity failure, provider-executability failure, or another explicit block condition.

### INTERRUPTED / UNCERTAIN

The process terminates without a clean application-owned complete/block result and preserved evidence must be reconciled without replay.

No operator may upgrade an interrupted state to PASS from platform status alone.

## 11. Independent verification requirement

`WRITE_COMPLETE_UNVERIFIED` is not PASS.

The next permissible transition after clean Phase-W closure is:

`STAGE_F_ZERO_PROVIDER_PHASE_V_INDEPENDENT_VERIFICATION`.

Phase V must make zero provider calls and independently verify the original evidence tree.

## 12. No preflight reversion

Once receipt #1 is crossed:

- a new preflight PASS does not erase provider evidence;
- a new runner build does not replace this candidate;
- a cleaner rerun is not continuation;
- a replacement deployment may not silently replay uncertain attempts;
- a post-hoc policy cannot be evaluated as if it had generated the original receipt ledger.

The current candidate must close from its own evidence.

## 13. Current control state

Before receipt #1:

`STAGE_F_PROVIDER_SHADOW_EXECUTION=AUTHORIZED`

`STAGE_F_RECEIPT_1_CROSSED=false`

`CONTROLLING_NEXT_TRANSITION=STAGE_F_PROVIDER_SHADOW_PHASE_W_EXECUTION`.

After receipt #1:

`STAGE_F_RECEIPT_1_CROSSED=true`

`CANDIDATE_INPUTS=IMMUTABLE`

`CONTROLLING_GATE=STAGE_F_PROVIDER_SHADOW_PHASE_W_TERMINAL_EVIDENCE`.

## 14. Product boundary

`OPENROUTER_CALLS_AUTHORIZED=0`

`FRONTIER_CALLS_AUTHORIZED=0`

`LIVE_EFFECTS_AUTHORIZED=0`

`AUTHORITY_EFFECTS=NONE`

`PRODUCTION_PROMOTION=false`.

This control-state freeze authorizes no broader use beyond the exact isolated Stage-F shadow execution.