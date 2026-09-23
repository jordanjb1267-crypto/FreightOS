# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Phase-W Terminal-Ledger Forensic Result v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE FORENSIC RESULT — PASS

Subordinate to `STAGE_F_PHASE_W_TERMINAL_BLOCK_RESULT_v0.1`, `STAGE_F_PHASE_W_TERMINAL_LEDGER_FORENSIC_AUTHORIZATION_v0.1`, all prior Stage-F receipt immutability/evidence controls, and all existing InterBraid / WorkforceOS / FreightOS / authority / evidence / provenance / tenant-isolation / replay / freshness / provider-substitution boundaries.

## INPUT BINDING

Run: `NSS1-STAGE-F-PROVIDER-SHADOW-v0.2`

Phase-W terminal receipt index SHA-256: `2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7`

Original ledger SHA-256 before forensic read: `e25fe3f9dc4dda2c4eb47cca25aa2b0d8acd2131738ae278d508fbce0d11b490`

Original ledger SHA-256 after forensic read: `e25fe3f9dc4dda2c4eb47cca25aa2b0d8acd2131738ae278d508fbce0d11b490`

`ORIGINAL_LEDGER_UNCHANGED=true`

Forensic result SHA-256: `65447706a68cf3ab92e0c115db98cf25c3c7a6aea8a1407b748c6211e1b8538f`

Forensic deployment: `c71bc411-9ab5-4d6d-9459-3d11295de59d`

## LEDGER CLOSURE

`TOTAL_RECEIPTS=400`

`TOTAL_ATTEMPTS=400`

`RECEIPT_INDEX_ENTRIES=400`

`RECEIPT_INDEX_MISMATCHES=0`

`QUESTION_SET_BINDING_MISMATCHES=0`

`STATE_BINDING_MISMATCHES=0`

`ATTEMPT_MISSING=0`

`RAW_RESPONSE_HASH_MISMATCHES=0`

`PROVIDER_CALLS_DURING_FORENSICS=0`

## LUNA RESULT

- receipts: 240
- attempts: 240
- raw responses: 240
- status: `OK=240`
- requested model: `gpt-5.6-luna=240`
- effective model: `gpt-5.6-luna=240`
- raw expected/present: `240/240`
- raw hash mismatch: 0
- mean latency: ~9979.50 ms
- p50 latency: 8941 ms
- p95 latency: ~18610.20 ms
- p99 latency: ~27148.67 ms
- max latency: 33697 ms
- input tokens: 164370
- output tokens: 182718
- total tokens: 347088

## JEV RESULT

- receipts: 160
- attempts: 160
- raw responses: 160
- status: `PROVIDER_ERROR=160`
- error: `JEV_422=160`
- requested model: `jev-latest=160`
- effective model: null for all 160
- raw expected/present: `160/160`
- raw hash mismatch: 0
- mean latency: ~60.51 ms
- p50 latency: 54 ms
- p95 latency: ~99.05 ms
- p99 latency: ~129.10 ms
- max latency: 166 ms

## FAILURE CLASSIFICATION

`NON_OK_PROVIDER_SET={JEV}`

`NON_OK_CLASS_COUNT=1`

`NON_OK_CLASS=PROVIDER_ERROR|JEV_422|null`

`FAILURE_ATTRIBUTION=SINGLE_JEV_FAILURE_CLASS`

The 160 Stage-F Jev observations are therefore NOT semantic-model judgments. The upstream provider rejected the requests before an effective Jev model identity was returned.

The Stage-F Phase-W BLOCK is attributable at this stage to Jev provider/request-contract execution failure, not to demonstrated Jev semantic inaccuracy.

No claim is made yet about the exact rejected request field or schema element; that requires direct read-only analysis of the preserved 422 response bodies.

## CURRENT-STATE APPLICATION

All provider receipts retained `current_state_application=false`; no provider judgment mutated authoritative runtime state.

`AUTHORITY_EFFECTS=NONE`

`LIVE_EFFECTS=0`

## CONTROLLING NEXT TRANSITION

`CONTROLLING_NEXT_TRANSITION=STAGE_F_JEV_422_PRESERVED_RAW_RESPONSE_CONTRACT_DIAGNOSIS_ONLY`

The next authorized operation is zero-provider inspection of the 160 already-preserved Jev raw 422 response bodies and their corresponding frozen attempt/request contract to identify the provider validation failure.

`PROVIDER_REPLAY=PROHIBITED`

`NEW_PROVIDER_CALLS=0`

`PRODUCTION_PROMOTION=false`