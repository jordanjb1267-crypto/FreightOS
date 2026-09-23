# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F R1 Immutable Luna-Reuse & 160-Jev Remediation Successor Design v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE SUCCESSOR DESIGN / PRE-EXECUTION CONTROL STATE

Subordinate to the Stage-F Phase-W terminal BLOCK, terminal-ledger forensic result, Jev 422 contract diagnosis, and `STAGE_F_JEV_REQUEST_CONTRACT_REMEDIATION_ZERO_CALL_PREFLIGHT_RESULT_v0.1`.

## SUCCESSOR IDENTITY

`SUCCESSOR_RUN_ID=NSS1-STAGE-F-JEV-REMEDIATION-R1-v0.1`

This is a new successor candidate. It is not a continuation or replay of `NSS1-STAGE-F-PROVIDER-SHADOW-v0.2`.

## OBSERVATION REUSE RULE

The predecessor Stage-F ledger contains 240 independently verified Luna `OK` receipts bound to the exact frozen Stage-F state snapshots, QuestionSet, corpus, and gold layers.

Those 240 Luna observations are admitted into R1 as immutable predecessor observations without new Luna inference.

Therefore:

`NEW_LUNA_CALLS=0`

`REUSED_LUNA_CONTROL_RECEIPTS=240`

`REUSED_LUNA_CANDIDATE_FALLBACK_RECEIPTS=80`

`NEW_JEV_CALLS_PLANNED=160`

`NEW_PROVIDER_ATTEMPT_DENOMINATOR=160`

The candidate work/semantic denominator remains the same 240 semantic Stage-F events.

## CONTROL AND CANDIDATE PROJECTION

Control projection:

- 240 frozen predecessor Luna OK receipts.

R1 candidate projection:

- 80 frozen predecessor Luna OK receipts on events whose precommitted candidate provider is Luna;
- 160 new R1 Jev observations on events whose precommitted candidate provider is Jev.

Thus the routing schedule and planned Luna suppression remain semantically identical to Stage F:

`LUNA_SUPPRESSION=1-80/240=66.6666666667%`

No Luna resampling is introduced.

## PREDECESSOR FAILED JEV RECEIPTS

The 160 predecessor Jev receipts with `JEV_422` remain immutable historical execution evidence.

They are not semantic judgments and are not substituted into R1 semantic-quality metrics.

They are not deleted, relabeled, or retried under the predecessor run ID.

R1 issues new attempts under a new run ID only after separate execution authorization.

## CONTRACT CHANGE

The sole intended Jev provider-contract change is the independently verified Noul serialization remediation:

`criteria: <string>`

becomes

`criteria: { true: <same frozen positive condition> }`.

Frozen successor request-contract identities:

- successor adapter SHA-256: `a012ee82256b635ae9f5b7790487013d22045b557a736cfbab615c9add1f410a`
- remediated question-schema SHA-256: `fb81d34a0ed11798d04bc332c28fcf0e80b7db4361ca16e488e6dcba1b2273b0`
- 160-request manifest SHA-256: `2de00a307df61db89cf69dd142b2e26cc9c102349f9fe8f40e5460cd39c29403`
- independent verification SHA-256: `aee61afac6472bc6249ddffd194fbe47c8823c76da822609fa34537a30e67da9`

## SCIENTIFIC BOUNDARY

The R1 comparison uses provider observations acquired at different wall-clock times. Every observation remains bound to the same immutable synthetic state and semantic contract.

The result must record actual requested/effective provider identities and execution timestamps. Any material provider-version identity change must be surfaced, not silently treated as equivalent.

No claim of provider determinism is implied.

## PRESERVED STAGE-F GATES

R1 preserves the frozen Stage-F semantic/work-outcome gold, Need gold, consequence classes/weights, known/novel metadata, freshness gold, authority expectations, metric specification, and acceptance gates.

No post-hoc gate relaxation is authorized.

## NEXT TRANSITION

`CONTROLLING_NEXT_TRANSITION=STAGE_F_R1_160_JEV_EXECUTION_RUNNER_ZERO_CALL_PREFLIGHT`

Before any new Jev call, an execute-capable R1 runner must be content-addressed, bind to the exact frozen Stage-F evidence roots and remediated request manifest, prove an empty new R1 effect ledger, preserve attempt-before-call/raw-response/no-replay semantics, and independently PASS at zero provider calls.

`R1_PROVIDER_EXECUTION=BLOCKED_PENDING_RUNNER_PREFLIGHT_AND_SEPARATE_AUTHORIZATION`

`AUTHORITY_EFFECTS=NONE`

`PRODUCTION_PROMOTION=false`