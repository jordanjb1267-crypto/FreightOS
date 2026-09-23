# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Pre-Receipt Provider Shadow Execution Authorization v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE EXPERIMENTAL EXECUTION AUTHORIZATION

Subordinate to `NSS-1 Stage-E Persistent Concurrent Event-Stream Zero-Call Result v0.1` and all prior InterBraid / NSS / Semantic Computation Plane / WorkforceOS / authority / evidence / provenance / tenant-isolation / provider-model-runtime substitution / Pass20 and Owner-controlled assurance state.

## Authorization question

Can the frozen Stage-E persistent concurrent runtime bind real typed Luna/Jev semantic receipts to exact authoritative pre-state hashes, preserve provider identity and durable receipt evidence, use the frozen provider matrix to suppress Luna calls, and deterministically reject stale semantic results without allowing model output to create or expand authority?

## Frozen zero-call predecessor

- Zero-call run: `NSS1-STAGE-E-ZERO-CALL-v0.1`
- Zero-call execution manifest SHA-256: `517f2fada5fe54dc22f21fff3b26d55a48e874bf5b08b46225287261e533062a`
- Zero-call Freeze Pointer SHA-256: `c7c7863c7d858a85ac7871b0f367ec7d3d2a0c665d84dcf7dc5119113b375d56`
- Provider Matrix SHA-256: `76eb87303b6307c5fd7d67c3719b78989d05ee34dbe5bbf7356071f1f1a20b28`
- Question Set SHA-256: `c007ae5b13c152a93432adb6491fd59d156bfc54a2c14bb537ff77af13edabb2`
- Total events: `384`
- Semantic events in corpus: `288`
- Provider-eligible semantic attempts after deterministic guards: `240`

## Provider matrix

The frozen zero-call provider matrix assigns every third provider-eligible attempt to Luna and the remaining attempts to Jev.

- Control arm: Luna on all `240` provider-eligible semantic attempts.
- Candidate arm: reuse Luna control receipt for `80` Luna-routed attempts; obtain Jev receipt for `160` Jev-routed attempts.
- Distinct authorized provider attempts: `400` maximum.
- Candidate Luna suppression: `160/240 = 66.6666666667%`.
- OpenRouter calls: `0`.
- Frontier calls: `0`.

## Model identities

- Luna requested/effective identity: `gpt-5.6-luna`.
- Jev requested identity: `jev-latest`.
- Jev accepted effective identity must be explicitly precommitted by the execution runner before receipt #1; no post-hoc identity widening is allowed.

## Shadow-only semantic boundary

Provider/model output is `NON_AUTHORITATIVE_SEMANTIC_JUDGMENT`.

Stage-E provider execution is shadow-only. Provider judgments may be normalized, compiled, compared, routed, marked stale/fresh, or measured, but they may not directly mutate the authoritative runtime state, create external effects, create authority, expand authority, or substitute for deterministic state-machine transitions.

The deterministic Stage-E event/state machine remains the authority over authoritative state. The provider experiment evaluates receipt binding and semantic scheduling around that state machine.

## Fresh-state rule

Every request must be bound to the exact `bound_state_sha256` already frozen in `semantic_attempts.json` and `provider_matrix.json`.

A semantic receipt is eligible for current-state consumption only when the consumer's authoritative state hash equals the receipt's frozen bound pre-state hash at the frozen deterministic completion point. Otherwise the receipt is stale historical computation and must be rejected from current-state application.

`TYPED_RECEIPT != CURRENT_TRUTH`
`MODEL_COMPLETION != AUTHORITY`
`STALE_RECEIPT != APPLICABLE_RECEIPT`

## Evidence rules

- attempt artifact must be persisted before every provider call;
- raw provider response must be persisted before normalization-dependent terminal claims;
- terminal receipt must bind provider, requested/effective model, event, state hash, question set, raw response hash, usage, latency, cost, normalized judgment, and terminal status;
- started-without-terminal-receipt is `ORCHESTRATION_UNCERTAIN`; retry is prohibited;
- post-hoc provider replay is prohibited as evidence reconstruction;
- independent verification must use persisted bytes only.

## Pre-receipt gates

Before provider receipt #1:

1. zero-call execution manifest hash exact match;
2. zero-call Freeze Pointer exact match;
3. provider matrix exact hash/count match (`240`, Luna `80`, Jev `160`);
4. question-set exact hash match;
5. every provider matrix row binds to a frozen semantic attempt and exact state hash;
6. provider execution manifest is serialized and SHA-256 frozen;
7. execution evidence directory contains zero pre-existing Stage-E provider receipts;
8. provider identities are precommitted;
9. `AUTHORITY_EFFECTS=NONE`, `OPENROUTER_CALLS=0`, `FRONTIER_CALLS=0`.

## Prohibited

No live freight effect, customer effect, external counterparty action, production dispatch, booking, payment, custody/transmission, financing, production signing, provider-side business mutation, or authority expansion.

## Controlling next transition

`CONTROLLING_NEXT_TRANSITION=STAGE_E_PROVIDER_RUNNER_ZERO_RECEIPT_PREFLIGHT`

Crossing provider receipt #1 requires a separate exact execution-manifest freeze produced by the runner preflight.