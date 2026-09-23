# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Read-Only Persisted Evidence Forensic Recovery Authorization v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE FORENSIC AUTHORIZATION

Subordinate to `NSS-1 Stage-C Execution Interruption & Evidence-Closure Failure Result v0.1` and all prior controlling InterBraid / NSS / Semantic Computation Plane / authority / evidence / provenance / tenant-isolation / provider-substitution assurance state.

## Authorization scope

Authorize exactly one read-only forensic recovery pass against the persisted Stage-C evidence volume produced by execution manifest `15a62008591e458748376e1b6edc21d6594b3dea5974fdf2e3b1300faa22e032`.

Permitted operations:

1. enumerate already-persisted files and directories;
2. read bytes without modification;
3. compute SHA-256 and byte lengths;
4. parse JSON artifacts;
5. count provider attempts, receipts, raw responses, and statuses;
6. verify receipt-to-event/provider/request-manifest attribution;
7. verify provider identities recorded in persisted receipts;
8. reconstruct control and candidate metrics solely from persisted normalized judgments and the frozen corpus/manifest;
9. compare independently reconstructed metrics to any pre-terminal `RESULT.json` already persisted;
10. produce a new forensic report outside the immutable Stage-C evidence directory.

## Prohibited

- No Luna calls.
- No Jev calls.
- No OpenRouter calls.
- No frontier calls.
- No post-hoc provider replay.
- No overwrite, repair, deletion, truncation, rename, or mutation of `/data/nss1-stage-c-v0.1` or its contents.
- No creation of replacement receipts.
- No retroactive modification of corpus, gold, QuestionSets, identity detector, safety floor, routing policy, compiler, provider identities, metrics, or thresholds.
- No semantic reinterpretation of missing evidence as observed evidence.
- No production authority, external counterparty action, freight effect, customer effect, or money movement.

## Acceptance classes

The forensic pass must terminate in exactly one of:

- `FORENSIC_RECOVERY=COMPLETE_RECONSTRUCTABLE`
- `FORENSIC_RECOVERY=PARTIAL_RECONSTRUCTABLE`
- `FORENSIC_RECOVERY=INCONCLUSIVE`

Only `COMPLETE_RECONSTRUCTABLE` may support a successor Stage-C semantic result freeze, and only when all receipts and required request/response preimages necessary to recompute the frozen metrics are present, attributable, parseable, and hash-verifiable.

The missing final evidence-tree closure remains a separate harness defect even if semantic metrics are fully reconstructable.

## Controlling next transition

`CONTROLLING_NEXT_TRANSITION=EXECUTE_READ_ONLY_FORENSIC_RECOVERY_ON_PERSISTED_STAGE_C_BYTES`

No production authority or authority expansion is created by this authorization.