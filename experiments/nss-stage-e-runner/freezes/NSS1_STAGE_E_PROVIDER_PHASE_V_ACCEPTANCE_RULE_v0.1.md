# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-E Provider Phase-V Acceptance Rule v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE PRE-RECEIPT VERIFICATION RULE

Subordinate to `NSS-1 Stage-E Provider Runner Receipt-1 Boundary Authorization v0.1`, `NSS-1 Stage-E Provider Execution Runtime Parameters v0.1`, and all prior controlling Stage-E / NSS / Semantic Computation Plane / TypeSafe-Jev / authority / evidence / provenance / tenant-isolation / provider-substitution state.

## PASS rule

`STAGE_E_PROVIDER_SHADOW_PASS` may be asserted only by a separate zero-provider Phase-V verification process reconstructing the claim from persisted bytes and only when every condition below is satisfied:

- exactly `400` indexed terminal receipts;
- exactly `400/400` receipts have `status=OK`;
- exactly `240` Luna receipts;
- exactly `160` Jev receipts;
- zero receipt JSON parse failures;
- zero receipt-file hash mismatches;
- zero raw-response hash mismatches;
- zero bound-state hash mismatches;
- zero QuestionSet mismatches;
- zero unexpected provider/event receipts;
- zero accepted provider/model identity mismatches;
- frozen runner manifest exact match `9b477dbb495d6aa3c890a4177efcbe35b18aa0e87691b1801aac135bebdea38b`;
- frozen zero-call manifest/pointer/provider-matrix/QuestionSet hashes exact match;
- `stale_receipt_current_state_applications=0`;
- `AUTHORITY_EFFECTS=NONE`;
- `OPENROUTER_CALLS=0`;
- `FRONTIER_CALLS=0`;
- `LIVE_EFFECTS=0`;
- verification provider calls = `0`.

Any provider failure, transport failure, normalization failure, model-identity failure, orchestration-uncertain receipt, missing receipt, or missing raw preimage prevents PASS even when it is itself valid observed evidence.

## Non-PASS semantics

A non-PASS result must preserve observed evidence and identify the concrete failing gate. It must not trigger provider replay or mutate the frozen request denominator.

`PROVIDER_FAILURE != SEMANTIC_ARCHITECTURE_FAILURE`

`EVIDENCE_CLOSURE_FAILURE != PROVIDER_SEMANTIC_FAILURE`

`TERMINAL_NON_OK_RECEIPT = OBSERVED_PROVIDER_EXECUTION_EVIDENCE`

`MISSING_OR_UNVERIFIABLE_PREIMAGE = EVIDENCE_CLOSURE_BLOCK`

The Phase-V verifier is frozen before provider receipt #1 at `experiments/nss-stage-e-runner/verify.mjs` and must execute with provider network access prohibited.

## Controlling next transition

`CONTROLLING_NEXT_TRANSITION=EXECUTE_CAPABLE_RUNNER_ZERO_RECEIPT_PREFLIGHT_THEN_SINGLE_PROVIDER_EXECUTION`

No production authority, live freight/customer/economic effect, external counterparty mutation, or authority expansion is authorized.