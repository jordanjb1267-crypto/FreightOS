# Owner Checkpoints

**Status:** permanent CCEP owner-authority protocol.

Owner checkpoints are authority boundaries. Passing tests, local acceptance, remote CI, a review verdict, or a mergeable pull request does not cross these boundaries by itself.

## Reserved Owner Decisions

The owner reserves authority over:

- merge
- deployment
- force push
- branch deletion where evidence could be lost
- production configuration
- remote CI or security configuration
- infrastructure changes
- acceptance of blocking known limitations
- scope changes that materially alter accepted architecture or product behavior

## Boundary Separation

```text
LOCAL_ACCEPTANCE does not imply PUSH
PUSH does not imply MERGE
REMOTE_CI_PASS does not imply MERGE
MERGE does not imply DEPLOY
```

Each boundary requires explicit owner authorization for that boundary.

## Permission Classes

| Class                  | Boundary                                                                         |
| ---------------------- | -------------------------------------------------------------------------------- |
| P0 READ_ONLY           | Inspect repository, sidecar, logs, reports, and metadata without mutation.       |
| P1 LOCAL_EXECUTION     | Run deterministic local commands using existing dependencies and local services. |
| P2 DISPOSABLE_MUTATION | Mutate only temporary copies, disposable worktrees, or test-owned fixtures.      |
| P3 REPOSITORY_WRITE    | Modify repository files, stage, or commit in the active worktree.                |
| P4 EXTERNAL_MUTATION   | Mutate external systems or durable state outside the repository.                 |

Separately authorized permissions:

```text
NETWORK
DEPENDENCY_INSTALL
PUSH
MERGE
DEPLOY
INFRASTRUCTURE_MUTATION
```

No permission class silently grants unrelated external authority.

## Required Pre-Merge Evidence

Before an owner merge decision, the responsible role records:

- immutable candidate HEAD and tree
- branch and worktree path
- worktree cleanliness
- ancestry/base branch state
- review class and review verdict
- unresolved or owner-deferred findings
- relevant local gates
- remote CI/check state when a remote branch exists
- exact merge method requested, if any

## Post-Merge Verification

After an owner-authorized merge, verify:

- merged commit identity
- reviewed candidate reachability from the target branch
- target branch HEAD and tree
- post-merge worktree cleanliness
- required local or remote gates
- no deployment occurred unless separately authorized
