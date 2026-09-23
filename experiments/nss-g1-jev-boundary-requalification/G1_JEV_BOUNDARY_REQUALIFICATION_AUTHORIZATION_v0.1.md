# InterBraid Persistent Semantic Nervous System — NSS-1 Experiment G1 Jev Boundary Requalification & Failure-Mode Separation Authorization v0.1

Effective: 2026-09-23

Status: CANONICAL ADDITIVE SUCCESSOR EXPERIMENT AUTHORIZATION — ZERO-CALL PREFLIGHT FIRST

Subordinate to the completed/reconciled NSS-1 Stage-E analysis state, the immutable Stage-F gold-bearing confirmatory design and evidence boundaries, Stage-F receipt-1 immutability/no-replay rules, and all prior InterBraid / WorkforceOS / Semantic Computation Plane / TypeSafe-Jev / authority / evidence / provenance / tenant-isolation / provider-substitution / security / Pass20 assurance state.

## 1. Purpose

G1 exists to answer a narrower question than Stage F:

> Can the Jev/System-One provider boundary reliably execute the typed semantic contracts, with failure modes separated into transport, authentication, provider-boundary, model-resolution, raw-capture, parse, schema, contract, and semantic-result dimensions, before any fresh claim is made about cognitive-suppression efficacy?

G1 does not reinterpret, repair, replay, replace, or mutate Stage F.

## 2. Stage-F boundary

The Stage-F experimental identity remains historical and immutable:

- 320 total events;
- 240 semantic events;
- 80 deterministic/code-only events;
- control Luna = 240 observations;
- candidate shared Luna = 80 observations;
- candidate Jev = 160 observations;
- distinct provider attempts = 400;
- planned Luna suppression = 66.6666666667%.

No Stage-F event ID, attempt ID, receipt body, provider request body, or ledger row may be reused as a G1 execution object.

G1 MUST NOT write into any Stage-F evidence directory.

## 3. Fresh G1 corpus

G1 freezes 32 fresh synthetic semantic fixtures across four existing Stage-F KNOWN semantic strata, 8 fixtures per stratum:

1. `minor_gps_update` — C0 informational / `STATE_UPDATE_ONLY` / no Need;
2. `detention_threshold_crossed` — C2 operational material / `KNOWN_PROCEDURE`;
3. `contradictory_facility_evidence` — C3 economic-or-service critical / `GENERAL_REASONING_REQUIRED`;
4. `factor_assignment_change` — C4 authority-or-safety critical / `HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED`.

The first two fixtures in each stratum form the 8-attempt canary. The remaining 24 are the expansion population.

All G1 IDs, state bytes, descriptions, nonces, request bodies, request digests, attempt IDs, and receipt IDs are fresh.

## 4. Provider boundary

Exactly one provider/model boundary is in scope:

- provider: `TYPESAFE_SYSTEM_ONE`;
- endpoint: `https://api.typesafe.ai/v1/systemone`;
- requested model: `jev-latest`;
- required effective model: `jev-1.13.0`.

No provider substitution is permitted inside G1.

## 5. Call budget

Maximum G1 provider-call budget:

- Jev calls: 32 maximum;
- Luna calls: 0;
- OpenRouter calls: 0;
- frontier calls: 0.

Preflight itself MUST perform zero provider calls and MUST read no provider credential.

## 6. Canary rule

G1 executes the 8-attempt canary first.

Expansion to the remaining 24 is prohibited unless:

- all 8 canary attempts reach a terminal receipt;
- orchestration-uncertain count = 0;
- fewer than 2 canary attempts share the same infrastructure-level failure class.

Infrastructure-level failure classes include:

- transport failure;
- authentication failure;
- provider-boundary HTTP failure;
- model-resolution / effective-model identity failure.

Two or more identical infrastructure-level failures stop G1 after the canary because additional calls would not materially improve diagnosis.

Schema/contract/semantic-result failures do not by themselves trigger this stop rule because those are part of the diagnostic population under study.

## 7. Evidence semantics

Every attempt MUST be durably persisted before the provider call.

Canonical sequence:

`PERSIST_STARTED_ATTEMPT -> PROVIDER_CALL -> RAW_CAPTURE -> TERMINAL_RECEIPT`

If a persisted `STARTED` attempt is encountered without a terminal receipt:

`ORCHESTRATION_UNCERTAIN`

and provider replay is prohibited.

No automatic retry is authorized.

## 8. Diagnostic receipt contract

Every terminal receipt must preserve or explicitly classify:

- fixture ID;
- stratum/family;
- canary/expansion phase;
- attempt ID;
- provider;
- requested model;
- effective model;
- bound state hash;
- request body hash;
- HTTP status where observed;
- transport status;
- authentication status;
- provider-boundary status;
- model-resolution status;
- raw-response capture status;
- raw-response SHA-256 where available;
- parse status;
- schema status;
- contract-normalization status;
- normalized semantic result where available;
- latency;
- provider usage metadata where supplied;
- terminal class;
- terminal reason.

A generic `NON-OK` without these diagnostic dimensions is insufficient for G1.

## 9. G1 boundary-pass gate

Full G1 boundary requalification requires:

- 32/32 attempts terminalized;
- orchestration uncertainty = 0;
- provider reachability = 32/32;
- required effective-model resolution = 32/32;
- raw-response capture = 32/32.

Parse/schema/contract/semantic judgments are reported separately and may identify the next semantic-contract remediation without being silently collapsed into infrastructure failure.

## 10. Authority boundary

G1 remains isolated synthetic shadow research.

`AUTHORITY_EFFECTS=NONE`

`LIVE_FREIGHT_EFFECTS=0`

`LIVE_MONEY_MOVEMENT=0`

`PRODUCTION_PROMOTION=false`

Model output remains non-authoritative evidence only.

## 11. Current transition

`CONTROLLING_NEXT_TRANSITION=G1_ZERO_CALL_FRESH_FIXTURE_AND_EXECUTION_MANIFEST_PREFLIGHT`

Provider execution remains blocked until the fresh 32-fixture corpus, exact question set, source surface, failure taxonomy, canary rule, call budget, and execution manifest are materialized and independently verified with zero provider calls.
