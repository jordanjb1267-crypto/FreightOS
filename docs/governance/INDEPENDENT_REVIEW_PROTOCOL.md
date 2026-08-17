# Independent Review Protocol

**Status:** permanent CCEP review protocol.

Independent review protects FreightOS from self-clearance, mutable targets, undocumented custody changes, and acceptance claims without evidence.

## Review Class Selection

Use `LEVEL_B_CROSS_AGENT_REVIEW` when the owner has explicitly enabled a different review provider or agent and it is practical for the phase.

Use `LEVEL_A_ISOLATED_SESSION_REVIEW` when an alternate provider is unavailable or not owner-enabled. Level A requires a fresh non-authoring session/context. It may use the same agent or model family, but it must not be represented as cross-model review.

Do not infer cross-agent availability. The active execution mode controls routing.

## Start Requirements

Before reviewing, record:

```text
REPOSITORY
WORKTREE_PATH
BASE
START_HEAD
START_TREE
BRANCH
WORKTREE_STATUS
ANCESTRY
REVIEW_CLASS
AUTHORING_CONTEXT
REVIEW_CONTEXT
```

Run:

```bash
git worktree list --porcelain
```

The reviewer must verify that the reviewed target is the intended immutable candidate. If target identity cannot be established, the review verdict is `NOT_PROVEN`.

## Reviewer Immutability

The reviewer operates read-only on the target. The reviewer must not edit, stage, commit, amend, rebase, reset, squash, or repair findings in the reviewed target.

Disposable validation is allowed outside the target through `mkdtemp`, temporary repository copies, disposable worktrees, or test-owned fixtures.

## Review Method

Use this sequence:

```text
detect -> reproduce -> classify -> report
```

Do not use:

```text
detect -> fix -> review own fix -> approve
```

## Evidence Standard

Prefer evidence in this order:

1. executed deterministic evidence
2. Git object identity
3. deterministic test or gate evidence
4. static repository evidence
5. independently verified phase reports
6. external coordination state
7. historical agent residue or conversation

Git object identity and executed evidence override sidecar state when they conflict.

## Finding Classification

Material findings receive durable IDs. Valid states are:

```text
DISCOVERED
CONFIRMED
REMEDIATION_REQUIRED
IMPLEMENTED
READY_FOR_REREVIEW
CLOSED
PARTIAL
KNOWN_LIMITATION
DEFERRED_BY_OWNER
OPEN
NOT_PROVEN
```

Closure requires prior failure evidence, corrected invariant, positive control, negative control, regression evidence, relevant gate/test evidence, and independent review where required.

## Review Verdicts

Allowed review verdicts:

```text
REMEDIATION_REQUIRED
READY_FOR_OWNER_MERGE_DECISION
NOT_PROVEN
```

A review verdict is not owner merge authority and is not deployment authority.

## End Requirements

End every review with:

```text
END_HEAD
END_TREE
BRANCH
STATUS
STAGED
UNSTAGED
UNTRACKED
NEXT_PERMITTED_PHASE
```

If the target changed during review and the reviewer did not intentionally use a disposable target, custody is broken and the verdict is `NOT_PROVEN`.
