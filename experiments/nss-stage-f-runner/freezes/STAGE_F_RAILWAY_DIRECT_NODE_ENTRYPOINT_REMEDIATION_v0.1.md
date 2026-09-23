# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-F Railway Direct-Node Entrypoint Remediation v0.1

**Effective:** 2026-09-22
**Status:** CANONICAL ADDITIVE HOST-PROJECTION RESULT — SECOND PRE-RECEIPT HOST FAILURE / NARROW REMEDIATION AUTHORIZED

Railway deployment `dbbae33f-f106-4a7f-91ef-66eda1b04d9b` used the correct source commit containing the Node evidence loader, but the shell-wrapped start command failed before application entry with:

`bash: line 1: node: command not found`.

The failure occurred before the evidence loader, Stage-F successor preflight, credential access, attempt persistence, or provider execution.

Therefore:

`STAGE_F_RECEIPT_1_CROSSED=false`

`STAGE_F_PROVIDER_CALLS=0`

`STAGE_F_PROVIDER_ATTEMPTS=0`

`STAGE_F_PROVIDER_RECEIPTS=0`

`AUTHORITY_EFFECTS=NONE`.

This is a Railway launch-environment/PATH defect only.

Authorize replacement of the shell-wrapped host command with one direct Node entry module that:

1. invokes the already-authorized Node evidence loader;
2. sets the extracted Stage-F evidence root;
3. imports the exact frozen successor `phase-w-program.mjs`;
4. preserves `RUN_MODE=preflight` until a Railway-local exact-manifest PASS is observed;
5. performs no provider call or credential read during preflight.

The host entry module is transport/orchestration glue only and MUST NOT modify corpus, gold, provider matrix, QuestionSet, routing, model identities, metrics, acceptance gates, successor program bytes, or evidence semantics.

`CONTROLLING_NEXT_TRANSITION=STAGE_F_RAILWAY_DIRECT_NODE_ZERO_CALL_PREFLIGHT`

Provider receipt #1 remains blocked until that exact preflight closes PASS with successor manifest `3a91b0041c798c665c5910db0b989e6deec0c3af2bb02b4d11f0e125f8bc37e5`.