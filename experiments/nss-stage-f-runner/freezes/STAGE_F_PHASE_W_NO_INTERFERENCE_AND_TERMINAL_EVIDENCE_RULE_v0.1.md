# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Phase-W No-Interference & Terminal Evidence Rule v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE CONTROL RULE

Subordinate to `STAGE_F_PHASE_W_LIVE_EXECUTION_CONTROLLING_STATE_v0.1`, the Stage-F Provider Shadow Execution Authorization, the Stage-F Provider Receipt-1 Controlling Transition & Immutability Rule, and all prior evidence-integrity, raw-receipt primacy, uncertain-effect, replay, freshness, tenant-isolation, provider-identity, authority-containment, and experimental-truth-preservation controls.

## CONTROLLING TRANSITION

> Let the immutable Stage-F Phase-W execution reach its own terminal evidence state without interference.

Accordingly:

`SERVICE_REDEPLOYMENT=PROHIBITED`

`SOURCE_MUTATION=PROHIBITED`

`RUNNER_MUTATION=PROHIBITED`

`CORPUS_MUTATION=PROHIBITED`

`GOLD_MUTATION=PROHIBITED`

`QUESTION_SET_MUTATION=PROHIBITED`

`ROUTING_MUTATION=PROHIBITED`

`PROVIDER_IDENTITY_MUTATION=PROHIBITED`

`THRESHOLD_MUTATION=PROHIBITED`

`DENOMINATOR_MUTATION=PROHIBITED`

`EVIDENCE_DIR_MUTATION=PROHIBITED`

`PROVIDER_REPLAY=PROHIBITED`

`MANUAL_RECEIPT_SYNTHESIS=PROHIBITED`

`MANUAL_PROVIDER_CALLS_OUTSIDE_FROZEN_RUNNER=PROHIBITED`

`FORENSIC_REPLACEMENT_DEPLOYMENT=PROHIBITED_WHILE_LIVE_STATE_IS_UNRESOLVED`

`NEW_EXPERIMENT_GATE=BLOCKED_PENDING_PHASE_W_TERMINAL_EVIDENCE`

## PERMITTED OBSERVATION

While `PROVIDER_LOOP_TERMINAL_STATE=UNRESOLVED`, only non-mutating observation is permitted, including read-only retrieval of the exact deployment's runtime logs/status and later read-only inspection of already-written durable evidence after the execution has demonstrably terminated or blocked.

Observation must not trigger a replacement deployment, restart, configuration write, variable write, source write that causes host replacement, provider retry, or any other action capable of altering the in-flight candidate.

## TERMINAL EVIDENCE AUTHORITY

Railway infrastructure labels (`SUCCESS`, `DEPLOYING`, `CRASHED`, etc.) are supporting orchestration evidence only. They do not substitute for application terminal evidence.

The Stage-F Phase-W application ledger controls. The candidate remains unresolved until one of the following is established from admissible evidence:

- application result `WRITE_COMPLETE_UNVERIFIED`;
- application result `BLOCK`;
- demonstrable interruption/uncertain state with durable attempt/receipt evidence sufficient to classify the effect without replay.

If an attempt exists as `STARTED` with no terminal receipt, the frozen rule remains:

`STARTED + NO_TERMINAL_RECEIPT = ORCHESTRATION_UNCERTAIN`

Such an attempt must not be silently retried or replaced. Any successor reconciliation must preserve it in the denominator and distinguish provider uncertainty from semantic correctness.

## PRE-EXECUTION TRANSPORT INCIDENTS

Two pre-execution transport incidents are explicitly non-semantic and non-provider evidence:

1. an expired signed evidence URL returned HTTP `403` before receipt #1 and before any provider attempt was written;
2. a mirrored ZIP reconstructed to SHA-256 `97c5b83637d79d64166b25f6696500ad089078b4e2c6a32e156ea253084dac22`, which did not equal the canonical archive SHA-256 `b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8`; that path was rejected before receipt #1.

Neither incident changes the Stage-F corpus, gold, routing, provider matrix, acceptance thresholds, or provider-execution denominator, and neither is admissible as model-quality evidence.

## NEXT GATE

No successor gate opens merely because the Railway rollout is marked successful. The controlling next transition is determined only after Phase-W terminal evidence is captured and frozen.

If Phase W closes `WRITE_COMPLETE_UNVERIFIED`, the next permissible operation is the already-designed independent verification/reconciliation of that exact durable receipt ledger, with zero provider replay unless separately justified by existing uncertainty rules.

If Phase W closes `BLOCK` or with demonstrable interruption evidence, the next permissible operation is forensic reconciliation of that exact terminal/interrupted ledger, not a clean replacement run.

Until then:

`CONTROLLING_NEXT_ACTION=READ_ONLY_OBSERVATION_OF_EXISTING_STAGE_F_PHASE_W_DEPLOYMENT`
