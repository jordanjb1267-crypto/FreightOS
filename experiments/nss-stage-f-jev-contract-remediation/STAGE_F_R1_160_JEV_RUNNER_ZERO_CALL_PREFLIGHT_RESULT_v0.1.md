# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F R1 160-Jev Runner Zero-Call Preflight Result v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE RUNNER PREFLIGHT RESULT — PASS

Subordinate to `STAGE_F_JEV_REQUEST_CONTRACT_REMEDIATION_ZERO_CALL_PREFLIGHT_RESULT_v0.1`, `STAGE_F_R1_IMMUTABLE_LUNA_REUSE_AND_160_JEV_SUCCESSOR_DESIGN_v0.1`, the immutable predecessor Stage-F ledger, and all prior authority/evidence/provenance/replay/provider-substitution boundaries.

## EXECUTION

GitHub Actions run: `35824113627`

Source commit: `a120e9ca61afa4dc55e6d7aeba4ee6d0daa8c278`

Phase-W preflight artifact ID: `10734451168`

Phase-W artifact SHA-256: `2231fd04d7c5bbc21ddec8285195b3aff90b86263ec18ffc264d44a484c0c65c`

Verified preflight artifact ID: `10734856321`

Verified preflight artifact SHA-256: `9f7347c9446328f823efc10ba1c7ff73dd92b837dd5fc83b12f72e4804a7dd72`

## RUNNER IDENTITY

`R1_RUN_ID=NSS1-STAGE-F-JEV-REMEDIATION-R1-v0.1`

`RUNNER_EXECUTION_MANIFEST_SHA256=a25b395fb70a571bea8711d1354a6032772a553468da8d005100aed4f3b386b8`

`REQUEST_MANIFEST_SHA256=2de00a307df61db89cf69dd142b2e26cc9c102349f9fe8f40e5460cd39c29403`

`QUESTION_SCHEMA_SHA256=fb81d34a0ed11798d04bc332c28fcf0e80b7db4361ca16e488e6dcba1b2273b0`

`VERIFIED_STAGE_F_ARCHIVE_SHA256=b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8`

`PREDECESSOR_RECEIPT_INDEX_SHA256=2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7`

`REMEDIATION_VERIFICATION_SHA256=aee61afac6472bc6249ddffd194fbe47c8823c76da822609fa34537a30e67da9`

## CONTENT-ADDRESSED EXECUTABLE SURFACE

- R1 runner SHA-256: `ad09343d6ecea6d8bae6984de296cec21d71f5f0ce39b4e9f63b202d76fc99dd`
- provider-contract SHA-256: `a012ee82256b635ae9f5b7790487013d22045b557a736cfbab615c9add1f410a`
- R1 provider adapter SHA-256: `6f849184754e88bdac4177bac426ebc38728a377124c493781408c7f22814a20`
- independent preflight verifier SHA-256: `bf2af2cfa09f11b8cd3e5224b742890737cef3b0355f704012930db1a9570c6c`

## ZERO-RECEIPT RESULT

`NEW_JEV_ATTEMPTS_PLANNED=160`

`NEW_LUNA_ATTEMPTS_PLANNED=0`

`REUSED_LUNA_CONTROL_RECEIPTS=240`

`REUSED_LUNA_CANDIDATE_FALLBACK_RECEIPTS=80`

`PROVIDER_CALLS=0`

`PROVIDER_ATTEMPTS=0`

`PROVIDER_RECEIPTS=0`

`CREDENTIALS_READ=false`

`RECEIPT_1_CROSSED=false`

`AUTHORITY_EFFECTS=NONE`

Phase-W preflight result SHA-256:

`2f08dad10a67adf5a75737d599d3cf0d4579aa9511c1fc36903bf695cecd64f9`

Independent verification result SHA-256:

`6e261ec9c73dec147073c1f7127b13b2fac2a1f3781006d25a1e379afb150f5a`

Both phases completed PASS with zero issues.

## RUNTIME PARAMETERS

`MAX_CONCURRENCY=6`

`PROVIDER_TIMEOUT_MS=120000`

`RESTART_POLICY=STARTED_WITHOUT_TERMINAL_TO_ORCHESTRATION_UNCERTAIN_NO_REPLAY`

Provider identity remains:

`REQUESTED_MODEL=jev-latest`

`REQUIRED_EFFECTIVE_MODEL=jev-1.13.0`

## CLAIM BOUNDARY

This PASS establishes only that the execute-capable R1 runner is deterministically bound to the remediated 160-request contract, immutable Stage-F evidence roots, predecessor Luna ledger identity, and zero-effect preflight boundary.

It does not establish upstream TypeSafe acceptance, model execution, semantic correctness, or production readiness.

## CONTROLLING NEXT TRANSITION

`CONTROLLING_NEXT_TRANSITION=STAGE_F_R1_RAILWAY_HOST_ZERO_RECEIPT_PREFLIGHT`

The exact R1 runner may be projected onto the credential-bearing Railway host only in `RUN_MODE=preflight`. Provider execution remains prohibited until that host rehearsal reproduces the exact manifest above with an empty R1 effect ledger and a separately frozen execution authorization is subsequently created.

`R1_PROVIDER_EXECUTION=BLOCKED`

`AUTHORITY_EFFECTS=NONE`

`PRODUCTION_PROMOTION=false`