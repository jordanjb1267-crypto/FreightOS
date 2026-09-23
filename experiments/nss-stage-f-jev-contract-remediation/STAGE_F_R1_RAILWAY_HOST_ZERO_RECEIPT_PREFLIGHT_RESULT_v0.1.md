# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F R1 Railway Host Zero-Receipt Preflight Result v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE HOST PREFLIGHT RESULT — PASS

Subordinate to `STAGE_F_R1_160_JEV_RUNNER_ZERO_CALL_PREFLIGHT_RESULT_v0.1`, `STAGE_F_R1_IMMUTABLE_LUNA_REUSE_AND_160_JEV_SUCCESSOR_DESIGN_v0.1`, the Stage-F Jev request-contract remediation PASS, and all prior authority/evidence/provenance/replay/provider-substitution boundaries.

## HOST EXECUTION

Railway deployment: `9f6d0333-52f1-4921-b634-5dd21ecd266b`

Railway source branch commit: `25a893bc7a2b8c5ae2a23715566ba858d91d1ee0`

Railway host entry SHA-256: `560c3ea6c4669b563ca9d95f808d6963c901b72f9808591d13b0b41c86728d76`

The exact four independently verified R1 executable/preflight source blobs were mirrored byte-for-byte onto the Railway source branch before this deployment.

## APPLICATION-OWNED PREFLIGHT EVIDENCE

The host evidence loader verified:

`VERIFIED_STAGE_F_ARCHIVE_SHA256=b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8`

and reported:

`provider_calls=0`

`credentials_read=false`

`authority_effects=NONE`.

The exact R1 runner then emitted `NSS1_STAGE_F_R1_RUNNER_PREFLIGHT` with:

`STATUS=PASS`

`RUN_ID=NSS1-STAGE-F-JEV-REMEDIATION-R1-v0.1`

`RUNNER_EXECUTION_MANIFEST_SHA256=a25b395fb70a571bea8711d1354a6032772a553468da8d005100aed4f3b386b8`

`REQUEST_MANIFEST_SHA256=2de00a307df61db89cf69dd142b2e26cc9c102349f9fe8f40e5460cd39c29403`

`QUESTION_SCHEMA_SHA256=fb81d34a0ed11798d04bc332c28fcf0e80b7db4361ca16e488e6dcba1b2273b0`

`PREDECESSOR_RECEIPT_INDEX_SHA256=2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7`

`REMEDIATION_VERIFICATION_SHA256=aee61afac6472bc6249ddffd194fbe47c8823c76da822609fa34537a30e67da9`

Counts:

- events: 320
- semantic events: 240
- new Jev attempts planned: 160
- reused Luna control receipts: 240
- reused Luna candidate fallback receipts: 80

Runtime:

- max concurrency: 6
- provider timeout: 120000 ms
- uncertain-effect rule: `STARTED_WITHOUT_TERMINAL_TO_ORCHESTRATION_UNCERTAIN_NO_REPLAY`

Boundary:

`PROVIDER_CALLS=0`

`PROVIDER_ATTEMPTS=0`

`PROVIDER_RECEIPTS=0`

`CREDENTIALS_READ=false`

`RECEIPT_1_CROSSED=false`

`ISSUES=[]`

`AUTHORITY_EFFECTS=NONE`

## CONCLUSION

The execute-capable R1 source surface that was independently verified in GitHub Actions reproduces the same frozen manifest and zero-effect state on the actual credential-bearing Railway host.

This PASS does not itself authorize provider execution.

## CONTROLLING NEXT TRANSITION

`CONTROLLING_NEXT_TRANSITION=STAGE_F_R1_160_JEV_PROVIDER_EXECUTION_AUTHORIZATION`

A separate authorization artifact must bind the exact manifest, remediated request contract, predecessor Luna receipt index, 160-call denominator, no-replay semantics, and new R1 evidence directory before receipt #1 may be crossed.

`R1_PROVIDER_EXECUTION=BLOCKED_PENDING_SEPARATE_AUTHORIZATION`

`AUTHORITY_EFFECTS=NONE`

`PRODUCTION_PROMOTION=false`