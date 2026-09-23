# InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Terminal Evidence Controlling Transition Rule v0.1

Effective: 2026-09-22

Status: CANONICAL ADDITIVE CONTROLLING-TRANSITION STATE

Subordinate to `InterBraid Persistent Semantic Nervous System — NSS-1 Stage-C Receipt-1 Execution Boundary Freeze v0.1` and all prior controlling InterBraid / NSS / Semantic Computation Plane / authority / evidence / provenance / tenant-isolation / provider-substitution assurance state.

## Controlling next transition

`CONTROLLING_NEXT_TRANSITION=APPLICATION_OWNED_STAGE_C_TERMINAL_EVIDENCE_ONLY`

While Stage-C execution deployment `504cb233-c17e-407f-9a54-15c528f8087e` remains the controlling execution attempt:

- observation is read-only;
- source mutation is prohibited;
- redeployment is prohibited;
- environment/provider/threshold/routing mutation is prohibited;
- forensic replacement of the running service is prohibited;
- infrastructure rollout status cannot substitute for experiment completion;
- post-hoc provider replay cannot reconstruct missing evidence;
- provider receipts, judgments, derived decisions, and terminal summaries must be treated as observed evidence only when durably persisted under the frozen execution manifest.

## Terminal acceptance rule

A terminal Stage-C claim is admissible only if all of the following hold:

1. It is emitted by the application-owned Stage-C runner for execution manifest `15a62008591e458748376e1b6edc21d6594b3dea5974fdf2e3b1300faa22e032`.
2. The record is bound to the same frozen zero-call pointer `a5a59bdb87fd0c8be211609fcbbac1df6150b7b4ae162880e67a256ebfe947a6`.
3. Provider receipt preimages required by the terminal record are durably retrievable, parseable, hash-verifiable, and attributable to the frozen request manifest.
4. Receipt counts and provider identities reconcile to the frozen candidate schedule or to an explicitly recorded fail-closed provider/runtime termination.
5. State reconstruction, identity detector, deterministic replay, and authority-effect invariants remain satisfied.
6. No OpenRouter/frontier call or external authority/effect appears unless separately authorized by a successor freeze; for this Stage-C run the authorized values remain `OPENROUTER_CALLS=0`, `FRONTIER_CALLS=0`, `AUTHORITY_EFFECTS=NONE`.
7. A separate verification pass can reconstruct the terminal claim from persisted bytes without relying on mutable process memory.

## Fail-closed semantics

If the active process terminates or becomes non-reconstructable after receipt #1 without an admissible terminal record, the result must not be inferred from partial logs or aggregate platform status. The controlling result becomes an evidence-closure failure / interrupted execution state, preserving all observed receipts already durably committed and prohibiting post-hoc semantic replay as a substitute for the missing original evidence.

`NO_TERMINAL_RECORD != PASS`
`PLATFORM_SUCCESS != EXPERIMENT_SUCCESS`
`PARTIAL_RECEIPTS != COMPLETE_RESULT`
`HASH_WITHOUT_RETRIEVABLE_PREIMAGE != DURABLE_EXPERIMENTAL_TRUTH`

No production authority or authority expansion is created by this transition rule.