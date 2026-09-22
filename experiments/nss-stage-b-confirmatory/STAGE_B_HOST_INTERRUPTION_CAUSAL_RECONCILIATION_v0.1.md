# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-B Host Interruption Causal Reconciliation v0.1

**Effective:** 2026-09-22  
**Status:** additive execution-evidence correction; no semantic experiment change.

Subordinate to `STAGE_B_SECOND_EXECUTION_INTERRUPTION_v0.1`, `STAGE_B_EXECUTION_INTERRUPTION_AND_RESUME_BOUNDARY_v0.1`, `STAGE_B_PRE_RECEIPT_FREEZE_v0.1`, and all predecessor assurance state.

## Correction

A read-only Railway diagnostic initially suggested that the two Stage-B worker terminations were caused by implicit HTTP-healthcheck/liveness behavior. That interpretation is **not adopted** as canonical because the deployment evidence provides a more direct causal explanation.

## Timeline evidence

### First Stage-B execution

- confirmatory worker container started: `2026-09-22T21:04:03Z`
- confirmatory worker received `SIGTERM` / `Stopping Container`: `2026-09-22T21:07:29Z`
- replacement forensic container started: approximately `2026-09-22T21:07:30Z`

### First safe resume

- confirmatory resume container started: `2026-09-22T21:10:08Z`
- confirmatory resume received `SIGTERM` / `Stopping Container`: `2026-09-22T21:11:25Z`
- replacement forensic container started: `2026-09-22T21:11:29Z`

In both cases, the termination occurs immediately before the successor source/deployment replacement becomes active.

Railway deployment metadata reports no application failure stage, crash, OOM, or configuration error for either confirmatory deployment. `healthcheckPath` was `null` in the inspected deployment configuration.

## Controlling causal interpretation

The evidence therefore supports:

`HOST_INTERRUPTION_PRIMARY_CAUSE=SUCCESSOR_DEPLOYMENT_REPLACEMENT`

rather than:

`HOST_INTERRUPTION_PRIMARY_CAUSE=SPONTANEOUS_BATCH_TIMEOUT`

The prior healthcheck-timeout explanation is retained only as a superseded diagnostic hypothesis, not as canonical evidence.

## Operational lesson

Railway deployment status `SUCCESS` establishes successful rollout of the deployment; it must not be interpreted as proof that a long-running one-shot application process has reached its own terminal experiment state.

For this experiment, terminal completion is established only by one of:

- application-emitted `NSS1_STAGE_B_COMPLETE`,
- application-emitted `NSS1_STAGE_B_BLOCK`, or
- later direct evidence-volume proof of a terminal `RESULT.json` / `FREEZE_POINTER.json`.

No replacement deployment may be initiated merely because Railway reports deployment `SUCCESS` while the application has not emitted a terminal experiment record.

## Resume consequence

No new orchestration architecture is required solely to address the two observed interruptions.

Safe resume of the exact frozen Stage-B runner remains authorized under the existing uncertainty rules:

- reuse all terminal receipts;
- convert `BEV-0055` and `BEV-0076` to local `ORCHESTRATION_UNCERTAIN` without replay;
- call providers only for never-attempted manifest entries;
- leave the executing deployment untouched until application-terminal evidence appears;
- keep OpenRouter/frontier prohibited;
- preserve the primary Stage-B provider-executability BLOCK caused by unresolved uncertain attempts.

Frozen identities remain unchanged:

- corpus: `e715fc2bba0390f230c26cd27667b8d224e9b5edf6daee60e7efa9875a143bcd`
- manifest: `52540690dab33fcc4bf170ccf57cad0b0e72da01dc45a94cdcff3d19ef79eb96`
- policies: `95a34517dd4e0ba879503aed049485df283b3fae9829a2b919356e08ecda28f5`

`SAFE_RESUME_EXACT_FROZEN_RUNNER=AUTHORIZED`
`REPLACEMENT_DEPLOYMENT_DURING_EXECUTION=PROHIBITED`
