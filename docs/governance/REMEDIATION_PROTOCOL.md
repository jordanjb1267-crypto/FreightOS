# Remediation Protocol

**Status:** permanent CCEP remediation protocol.

Remediation converts confirmed findings into a candidate change. Remediation does not clear its own findings and does not create merge authority.

## Start Requirements

Before remediation, record:

```text
REPOSITORY
WORKTREE_PATH
BASE
START_HEAD
START_TREE
BRANCH
WORKTREE_STATUS
ANCESTRY
FINDINGS_ACCEPTED_FOR_REMEDIATION
```

Run:

```bash
git worktree list --porcelain
```

Verify the active worktree is the intended remediation worktree. Do not reset or checkout a primary worktree merely to make it match a candidate already present elsewhere.

## Scope Discipline

Remediation is limited to:

- confirmed findings
- directly required regression evidence
- directly required governance or test wiring
- narrow documentation needed to explain the fix

Unrelated maintenance, dependency upgrades, runner upgrades, evidence cleanup, and product behavior changes require separate owner authorization unless inseparable from the remediation.

## Implementation Evidence

For each remediated material finding, record:

```text
FINDING_ID=
PREVIOUS_STATE=
NEW_STATE=IMPLEMENTED
PRIOR_FAILURE_CONDITION=
CORRECTED_INVARIANT=
POSITIVE_CONTROL=
NEGATIVE_CONTROL=
REGRESSION=
RELEVANT_GATE_OR_TEST=
```

A pre-existing green suite alone is not closure evidence.

## Negative Fixtures

Destructive or negative validation must use disposable or test-owned locations:

- `mkdtemp`
- disposable worktrees
- temporary repository copies
- test-owned fixtures

Never destructively mutate accepted handoff packages, frozen review targets, or production state.

## End Requirements

At the end of remediation, record:

```text
END_HEAD
END_TREE
BRANCH
STATUS
STAGED
UNSTAGED
UNTRACKED
NEXT_PERMITTED_PHASE=READY_FOR_INDEPENDENT_REREVIEW
```

The implementer may emit:

```text
READY_FOR_INDEPENDENT_REREVIEW
```

The implementer must not independently claim final acceptance of its own material change.
