# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Execution Interruption & Evidence-Closure Failure Result v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE EXECUTION-EVIDENCE STATE

Subordinate to `NSS-1 Stage-C Receipt-1 Execution Boundary Freeze v0.1`, `NSS-1 Stage-C Terminal Evidence Controlling Transition Rule v0.1`, and all prior InterBraid / NSS / Semantic Computation Plane / authority / evidence / provenance / tenant-isolation / provider-substitution assurance state.

## Result

- `NSS1_STAGE_C_EXECUTION=INTERRUPTED_AFTER_PROVIDER_PHASE`
- `NSS1_STAGE_C_TERMINAL_SEMANTIC_RESULT=NOT_ADMISSIBLE_YET`
- `NSS1_STAGE_C_EVIDENCE_CLOSURE=FAIL`
- `NSS1_STAGE_C_COMPLETE_EMITTED=false`
- `POST_HOC_PROVIDER_REPLAY=PROHIBITED`
- `PERSISTED_RECEIPT_RECOVERY=AUTHORIZED_SEPARATELY_ONLY`
- `AUTHORITY_EFFECTS=NONE`
- `OPENROUTER_CALLS=0`
- `FRONTIER_CALLS=0`

## Controlling deployment

Execution deployment: `504cb233-c17e-407f-9a54-15c528f8087e`

Frozen execution manifest: `15a62008591e458748376e1b6edc21d6594b3dea5974fdf2e3b1300faa22e032`

Frozen zero-call pointer: `a5a59bdb87fd0c8be211609fcbbac1df6150b7b4ae162880e67a256ebfe947a6`

## Observed terminal failure

After receipt #1, the runner executed under the frozen manifest. At `2026-09-22T23:44:46Z`, the application raised:

`ReferenceError: readdir is not defined`

The exception occurred in `xHashTree(root)` during evidence-tree construction after the runner code path had already written `CONTROL_RESULT.json`, `CANDIDATE_RESULT.json`, and `RESULT.json`, but before it could write the final Stage-C `FREEZE_POINTER.json` and before it could emit `NSS1_STAGE_C_COMPLETE`.

The deployment subsequently stopped. Railway platform status is not treated as semantic experiment completion.

## Interpretation

This is a harness/evidence-closure defect, not evidence that the semantic architecture passed or failed its pre-registered acceptance gates.

The persisted provider receipts and result artifacts, if present and independently reconstructable from the mounted evidence volume, remain admissible observed evidence. They must not be regenerated or replaced by provider replay.

`PARTIAL_OR_PRETERMINAL_RESULT_ARTIFACT != CANONICAL_TERMINAL_RESULT`

`EVIDENCE_TREE_FAILURE != SEMANTIC_FAILURE`

`MISSING_STAGE_C_COMPLETE != PASS`

`MISSING_STAGE_C_COMPLETE != SEMANTIC_BLOCK`

## Controlling next transition

`CONTROLLING_NEXT_TRANSITION=READ_ONLY_PERSISTED_EVIDENCE_FORENSIC_RECOVERY`

The successor may inspect and hash already-persisted bytes only. It may not call Luna, Jev, OpenRouter, frontier models, external authorities, or any live freight/economic system. It may not mutate or overwrite the Stage-C evidence directory.

No production authority, external effect, money movement, customer effect, freight effect, or authority expansion is authorized by this freeze.