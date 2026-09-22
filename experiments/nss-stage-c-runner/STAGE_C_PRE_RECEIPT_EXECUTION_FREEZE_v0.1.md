# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Pre-Receipt Execution Freeze v0.1

**Effective:** 2026-09-22  
**Status:** PRE-RECEIPT IMMUTABLE EXECUTION BOUNDARY  
**Provider receipts at freeze:** `0`

## Controlling preflight anchors

- Stage-C zero-call artifact index: `6c9bdd96dbf7c8175b348248efed67b10024975f96d8530965f6affcc38bae47`
- Stage-C zero-call verification result: `59a5a7ffe39161ab73392aadf001bd3789ec9a3006fd0aee82eff0a9332a3dac`
- Stage-C zero-call Freeze Pointer: `a5a59bdb87fd0c8be211609fcbbac1df6150b7b4ae162880e67a256ebfe947a6`
- Stage-C execution manifest: `15a62008591e458748376e1b6edc21d6594b3dea5974fdf2e3b1300faa22e032`

## Frozen denominator

- total events: `176`
- semantic/provider-eligible events: `168`
- deterministic replay events: `8`
- identity fixtures: `56`
- pre-state reconstruction: PASS
- successor-state reconstruction: PASS
- deterministic identity detector: PASS, 0 false negatives, 0 false positives
- duplicate/replay reconstruction: PASS

## Frozen provider plan

### Control

One canonical Luna observation for each of the 168 semantic events.

### Candidate

`BALANCED_FAMILY_AWARE_ROUTING_PLUS_STRUCTURAL_IDENTITY_SAFETY_FLOOR`

- Luna observations: `60`
- Jev observations: `108`
- planned Luna suppression: `64.28571428571428%`
- unknown family fallback: Luna
- provider observations are shared by event/provider; no repeated Luna sampling between control and candidate.

Provider identities:

- Luna requested model: `gpt-5.6-luna`
- Jev requested model: `jev-latest`
- Jev required effective model: `jev-1.13.0`
- OpenRouter calls: `0`
- frontier calls: `0`

## Frozen safety-floor semantics

The identity floor is structural, not family-name based.

`MISMATCH`, or material `AMBIGUOUS` / `UNRESOLVED`, imposes:

`MINIMUM_DISPOSITION=GENERAL_REASONING_REQUIRED`.

A probabilistic semantic result may raise the disposition above this floor but may not lower it.

The floor creates no Need, authority, evidence, delegation, or external action permission.

## Frozen acceptance gates

All are conjunctive:

- Luna suppression >= 50%
- exact-disposition noninferiority margin <= 5 percentage points
- false-safe degradation <= 2 percentage points
- identity-detector false negatives = 0
- identity-detector false positives = 0
- provider-executability closure = 100%
- state reconstruction = 100%
- authority effects = NONE
- OpenRouter calls = 0
- frontier calls = 0

## Receipt-1 immutability

At the time of this freeze, `provider_receipts=0`.

After the first provider attempt, the following may not change in place:

- corpus and event denominator
- identity fixtures and detector
- semantic QuestionSets
- identity, semantic, and work gold
- structural safety-floor rule
- routing policy and unknown-family fallback
- provider observation matrix
- deterministic compiler
- provider identities
- acceptance gates
- metrics
- execution manifest

Any material change requires a successor candidate.

## Execution/recovery rule

Every provider attempt is persisted as `STARTED` before transmission.

If a persisted STARTED attempt later has no terminal receipt, blind replay is prohibited. It becomes an uncertain orchestration/provider effect requiring reconciliation.

Once execution begins, no replacement deployment, source switch, forensic reader, or configuration mutation is permitted until the application itself emits `NSS1_STAGE_C_COMPLETE` or another durable terminal application-owned state.

## Authority boundary

`AUTHORITY_EFFECTS=NONE`

No live freight effect, economic effect, production activation, external counterparty action, Pass20 mutation, OpenRouter execution, or frontier execution is authorized.
