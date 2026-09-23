# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Provider Execution Runtime Parameters v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE PRE-RECEIPT RUNTIME-PARAMETER FREEZE

Subordinate to `NSS-1 Stage-E Provider Runner Receipt-1 Boundary Authorization v0.1` and all prior controlling Stage-E / NSS / Semantic Computation Plane / TypeSafe-Jev / authority / evidence / provenance / tenant-isolation / provider-substitution state.

## Purpose

Freeze runtime parameters that can materially affect concurrent provider execution before provider receipt #1. These parameters are infrastructure/execution parameters only and do not alter the already-frozen Stage-E corpus, semantic-attempt denominator, QuestionSet, provider matrix, model identities, state bindings, semantic gates, or authority boundary.

## Runtime parameters

- `MAX_PROVIDER_CONCURRENCY=6`
- `PROVIDER_TIMEOUT_MS=120000`
- `DISPATCH_ORDER=FROZEN_SEMANTIC_ATTEMPT_ORDER_THEN_PROVIDER`
- `CONTROL_PROVIDER=LUNA`
- `CANDIDATE_PROVIDER_MATRIX=FROZEN_STAGE_E_PROVIDER_MATRIX`
- `CONTROL_LUNA_CALLS=240`
- `CANDIDATE_SHARED_LUNA_RECEIPTS=80`
- `CANDIDATE_JEV_CALLS=160`
- `MAX_DISTINCT_PROVIDER_ATTEMPTS=400`
- `NETWORK_RETRY_ON_STARTED_WITHOUT_RECEIPT=PROHIBITED`
- `POST_HOC_PROVIDER_REPLAY=PROHIBITED`

Provider calls may execute concurrently up to six active requests. Concurrency changes wall-clock ordering only; freshness/staleness classification must remain determined by the frozen deterministic Stage-E completion schedule and authoritative state-hash semantics, not by observed network completion order.

## Provider endpoints and identities

- Luna endpoint: OpenAI Responses API, `POST https://api.openai.com/v1/responses`
- Luna requested/effective required model: `gpt-5.6-luna`
- Jev endpoint: TypeSafe System One API, `POST https://api.typesafe.ai/v1/systemone`
- Jev requested model: `jev-latest`
- Jev effective required model: `jev-1.13.0`

No provider identity widening is permitted after receipt #1.

## TypeSafe wire semantics

Use the already-tested direct TypeSafe System One contract: `{state, model: "jev-latest", questions}`. Choice, Noul, and Score remain typed and distinct. No new or guessed TypeSafe wire format is authorized.

## Evidence sequencing

For each distinct provider attempt:

1. reconstruct the exact frozen bound authoritative pre-state;
2. verify `sha256(pre_state) == bound_state_sha256`;
3. durably write the STARTED attempt artifact;
4. dispatch exactly one provider request;
5. durably write raw provider response bytes before normalization-dependent terminal claims;
6. verify effective provider/model identity;
7. normalize typed judgment;
8. durably write terminal receipt binding raw-response hash and frozen request identity.

If step 3 exists without step 8 on recovery, the attempt is `ORCHESTRATION_UNCERTAIN` and must not be re-dispatched.

## State materialization rule

The execute-capable runner must independently reconstruct every provider-eligible semantic attempt's authoritative pre-state from the frozen Stage-E initial states, event stream, deterministic guards, and deterministic completion schedule. All `240/240` reconstructed pre-state hashes must equal the already-frozen `bound_state_sha256` values before receipt #1.

Failure of even one state-hash reconstruction blocks all provider execution.

## Freshness rule

Observed network latency does not redefine Stage-E semantic freshness. Each receipt inherits the frozen deterministic attempt outcome:

- zero-call attempt status `APPLIED` => deterministically fresh at its frozen completion point;
- zero-call attempt status `STALE_REJECTED` => deterministically stale at its frozen completion point.

No stale receipt may be presented as current-state applicable. Since Stage E is shadow-only, neither fresh nor stale receipts mutate authoritative state.

## Telemetry-only pricing constants

For comparative telemetry only, not billing authority:

- Luna: input `$0.20/M`, cached input `$0.02/M`, output `$1.20/M`.
- Jev: input `$0.042/M`, output `$0/M`.

If provider-reported usage is absent or incompatible, cost telemetry is `UNKNOWN` rather than inferred from unverified values. Cost telemetry has no effect on semantic acceptance or authority.

## Phase separation

- Phase W: provider execution and durable attempt/raw/receipt/result write.
- Phase V: separate zero-provider verification from persisted bytes only.

`PHASE_W_SUCCESS != VERIFIED_RESULT`.

Stage-E semantic/provider claims are not canonical until Phase V reconstructs and verifies the persisted evidence without provider calls.

## Prohibited

No OpenRouter/frontier call, live freight/customer/economic effect, external counterparty mutation, production signing, dispatch/booking/payment/custody/financing, or authority expansion.

## Controlling next transition

`CONTROLLING_NEXT_TRANSITION=IMPLEMENT_AND_ZERO_RECEIPT_PREFLIGHT_EXECUTE_CAPABLE_STAGE_E_RUNNER`
