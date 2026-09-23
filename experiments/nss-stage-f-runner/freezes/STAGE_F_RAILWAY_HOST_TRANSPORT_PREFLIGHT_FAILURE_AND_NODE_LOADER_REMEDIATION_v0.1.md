# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Railway Host-Transport Preflight Failure & Node Loader Remediation v0.1

**Effective:** 2026-09-22
**Status:** CANONICAL ADDITIVE HOST-PROJECTION RESULT — FAILED_BEFORE_RECEIPT_1 / NARROW_REMEDIATION_AUTHORIZED

Subordinate to the Stage-F successor Phase-W program preflight PASS, `STAGE_F_PROVIDER_LOOP_COMPLETENESS_BLOCK_AND_SUCCESSOR_REBIND_v0.1`, the Stage-F v0.2 provider-shadow authorization, and all prior NSS / authority / evidence / provenance / provider-substitution assurance state.

## 1. Railway preflight attempt

Railway deployment:

`29a17d6f-b0a3-470d-8f4c-b99cbfe7d7bc`

was launched with:

`RUN_MODE=preflight`.

The service mounted the existing durable `/data` volume and attempted only to materialize the exact verified Stage-F evidence archive before running the zero-call successor Phase-W program preflight.

## 2. Failure

The container terminated before Stage-F application preflight because the host image did not contain the command-line utility:

`curl`.

Observed terminal host error:

`bash: line 1: curl: command not found`.

No Stage-F provider program was entered.

## 3. Effect boundary

At this failure boundary:

`STAGE_F_RECEIPT_1_CROSSED=false`

`STAGE_F_PROVIDER_CALLS=0`

`STAGE_F_PROVIDER_ATTEMPTS=0`

`STAGE_F_PROVIDER_RECEIPTS=0`

`STAGE_F_RAW_PROVIDER_RESPONSES=0`

`AUTHORITY_EFFECTS=NONE`.

This is a host-transport dependency failure only. It is not semantic, provider, routing, gold, or architecture evidence.

## 4. Authorized remediation

Authorize only replacement of the unavailable external `curl` / shell-unzip transport with a deterministic Node-based evidence loader using the runtime already present in the container.

The loader MUST:

1. fetch only the already-frozen Stage-F verified evidence archive;
2. verify archive SHA-256 equals `b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8` before extraction;
3. reject path traversal or unsupported ZIP compression methods;
4. extract to an isolated temporary path;
5. perform no Luna, Jev, OpenRouter, or frontier calls;
6. read no provider credentials;
7. leave `/data/nss1-stage-f-provider-v0.2` untouched during preflight;
8. hand the extracted root to the exact frozen `phase-w-program.mjs`, which independently verifies every frozen inner evidence-root hash.

## 5. Non-mutation rule

This remediation MUST NOT alter:

- Stage-F corpus or gold;
- QuestionSet;
- provider matrix;
- provider identities;
- routing;
- metrics / thresholds;
- successor execution manifest inputs;
- Phase-W or Phase-V semantics;
- authority / freshness / no-replay rules.

If the mirrored execution sources do not reproduce successor manifest:

`3a91b0041c798c665c5910db0b989e6deec0c3af2bb02b4d11f0e125f8bc37e5`

then execution remains blocked.

## 6. Controlling transition

`CONTROLLING_NEXT_TRANSITION=STAGE_F_RAILWAY_LOCAL_ZERO_CALL_SUCCESSOR_PREFLIGHT_WITH_NODE_EVIDENCE_LOADER`

Receipt #1 remains prohibited until that Railway-local preflight itself closes PASS with zero attempts, zero receipts, zero provider calls, and the exact successor manifest.