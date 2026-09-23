# InterBraid Persistent Semantic Nervous System — System-One Provider Failure Containment & Cognitive Escalation — Isolated Deterministic Successor Authorization v0.1

**Effective:** 2026-09-23  
**Status:** `AUTHORIZED_TO_IMPLEMENT_AND_EXECUTE_ISOLATED_DETERMINISTIC_HARNESS_V0_1`

Subordinate to `InterBraid Persistent Semantic Nervous System — Stage-F C4 Structural Authority Floor Fresh Held-Out Result v0.1`, all Stage-F / R1 / C4 / no-replay / authority / evidence / provenance / tenant-isolation state, and all controlling Pass20/Owner assurance boundaries.

## Research question

Can the runtime remain fail-safe when its cheap semantic System-One provider is unavailable, malformed, version-incompatible, or orchestration-uncertain—while preserving deterministic authority floors for structurally authority-sensitive work and escalating residual cognition without silently fabricating a semantic answer?

## Scope

Authorize only isolated, offline, deterministic synthetic harness implementation and execution.

```text
LIVE_PROVIDER_CALLS=0
JEV_CALLS=0
LUNA_CALLS=0
OPENROUTER_CALLS=0
FRONTIER_CALLS=0
CREDENTIAL_READS=0
STAGE_F_PROVIDER_REPLAY=false
LIVE_FREIGHT_EFFECTS=0
AUTHORITY_EFFECTS=NONE
CURRENT_STATE_APPLICATION=false
PRODUCTION_PROMOTION=false
```

## Fresh fixture denominator

Exactly `96` fresh synthetic cases:

- `48` structural-positive authority-floor cases
- `48` structural-negative cases

Each class contains exactly `8` cases for each simulated semantic-execution state:

1. `OK`
2. `PROVIDER_ERROR`
3. `TIMEOUT`
4. `SCHEMA_INVALID`
5. `MODEL_VERSION_MISMATCH`
6. `ORCHESTRATION_UNCERTAIN`

The fixture is successor-only and MUST NOT reuse historical Stage-F/C4 event IDs or receipts.

## Structural authority floor

The following state transitions independently establish minimum business response `HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED`:

1. `seal_status -> DISCREPANCY`
2. `receiver_identity_status -> CONFLICT`
3. existing non-null `factor_assignment` changes to a different non-null assignment

This floor is computed before semantic-provider interpretation and is monotonic: provider output, provider failure, or provider uncertainty may not downgrade it.

## Runtime failure semantics

### Structural-positive case

If the deterministic authority floor fires, final minimum business response is `HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED` regardless of semantic-provider status.

Provider failure MUST NOT erase or downgrade the deterministic floor.

### Structural-negative + terminal non-OK semantic result

For `PROVIDER_ERROR`, `TIMEOUT`, `SCHEMA_INVALID`, or `MODEL_VERSION_MISMATCH`:

```text
business_response=UNRESOLVED
cognitive_route=SYSTEM_TWO_REQUIRED
current_state_application=false
retry_same_attempt=false
```

The runtime MUST NOT substitute `NO_ACTION`, `STATE_UPDATE_ONLY`, or fabricated authority as a semantic result.

### Structural-negative + orchestration uncertainty

For `ORCHESTRATION_UNCERTAIN`:

```text
business_response=UNRESOLVED
cognitive_route=RECONCILIATION_REQUIRED
retry_same_attempt=false
current_state_application=false
```

An uncertain started attempt MUST NOT be treated as safe to replay.

### Structural-negative + OK semantic result

The valid bounded semantic result passes through unchanged.

## Acceptance gates

The harness passes only if all of the following hold on the locked denominator:

```text
TOTAL=96
STRUCTURAL_POSITIVE=48
STRUCTURAL_NEGATIVE=48
STATUS_COUNT_EACH_CLASS_EACH_STATUS=8

STRUCTURAL_POSITIVE_FALSE_SAFE=0
DETERMINISTIC_GUARD_CONFORMANCE=100%

NEGATIVE_TERMINAL_FAILURE_SYSTEM_TWO_ROUTE=32/32
NEGATIVE_UNCERTAIN_RECONCILIATION_ROUTE=8/8
NEGATIVE_FAILURE_DEFAULT_NO_ACTION=0
NEGATIVE_FAILURE_FABRICATED_AUTHORITY=0

UNCERTAIN_RETRY_ALLOWED=0
NON_OK_CURRENT_STATE_APPLICATIONS=0
STATE_BINDING_INTEGRITY=100%
CROSS_TENANT_CONTAMINATION=0

NETWORK_CALLS=0
CREDENTIAL_READS=0
PROVIDER_REPLAY=false
AUTHORITY_EFFECTS=NONE
LIVE_EFFECTS=0
```

## Evidence rules

- Fixture root, execution root, and Phase-V verification root are distinct and write-once.
- The independent verifier must not import the execution policy implementation.
- A failed verification may not delete or rewrite prior output evidence.
- No result from this harness promotes production authority or repairs historical evidence.

## Controlling transition after PASS

A PASS authorizes design—not automatic provider execution—of the next fresh observational runtime experiment combining immutable external-observation snapshots, state normalization, System-One semantics, deterministic authority/failure policy, and bounded System-Two fallback.
