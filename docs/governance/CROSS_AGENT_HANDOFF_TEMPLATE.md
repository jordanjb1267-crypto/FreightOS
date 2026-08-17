# Cross-Agent Handoff Template

Use this template when a CCEP-governed session ends, changes role, approaches a usage/session limit, or transfers custody to another agent or session.

This is a template only. Do not commit live phase state, transient sidecar snapshots, temporary worktree paths, or active candidate coordinates into this file.

```text
REPORT_TYPE=HANDOFF
PROTOCOL=CCEP
SYSTEM=FreightOS
FROM_AGENT_IDENTITY=
FROM_ENGINEERING_ROLE=
TO_AGENT_IDENTITY=
TO_ENGINEERING_ROLE=TAKEOVER_AGENT
EXECUTION_MODE=
PHASE=
NEXT_PERMITTED_PHASE=
```

## Chain Of Custody

```text
CHAIN_OF_CUSTODY
```

```text
REPOSITORY=
WORKTREE_PATH=
BASE=
START_HEAD=
START_TREE=
END_HEAD=
END_TREE=
BRANCH=
WORKTREE_STATUS=
STAGED=
UNSTAGED=
UNTRACKED=
ANCESTRY=
```

## Permissions

```text
P0_READ_ONLY=
P1_LOCAL_EXECUTION=
P2_DISPOSABLE_MUTATION=
P3_REPOSITORY_WRITE=
P4_EXTERNAL_MUTATION=
NETWORK=
DEPENDENCY_INSTALL=
PUSH=
MERGE=
DEPLOY=
INFRASTRUCTURE_MUTATION=
```

## Candidate Freeze

```text
CANDIDATE_FROZEN=
FROZEN_HEAD=
FROZEN_TREE=
REVIEW_CLASS=
AUTHORING_CONTEXT=
REVIEW_CONTEXT=
```

## Scope

Describe exactly what was in scope and explicitly list known out-of-scope items.

## Finding Ledger

```text
FINDING_LEDGER
```

List durable finding IDs and states. Do not drop a prior finding because it was omitted from a later report.

```text
ID=
STATE=
SEVERITY=
LINEAGE=
CLOSURE_AUTHORITY=
EVIDENCE=
```

## Evidence

Record deterministic evidence first, then static evidence, then sidecar or historical context.

## Command Ledger

```text
COMMAND_LEDGER
```

Record command, working directory, result, and whether it mutated repository, disposable, or external state.

## Known Limitations

List `NOT_PROVEN`, `KNOWN_LIMITATION`, and owner-deferred items separately.

## Remaining Work

State the smallest exact next action. Do not ask the owner to reconstruct context from memory.

## Final Git State

```text
END_HEAD=
END_TREE=
BRANCH=
STATUS=
STAGED=
UNSTAGED=
UNTRACKED=
NEXT_PERMITTED_PHASE=
```

## Verdict

Use one explicit verdict:

```text
READY_FOR_INDEPENDENT_REREVIEW
REMEDIATION_REQUIRED
READY_FOR_OWNER_MERGE_DECISION
READY_FOR_OWNER_FINAL_MERGE_DECISION
COMPLETE
NOT_PROVEN
```
