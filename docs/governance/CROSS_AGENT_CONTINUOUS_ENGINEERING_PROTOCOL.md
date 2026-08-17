# Cross-Agent Continuous Engineering Protocol

**Status:** permanent repository governance protocol.
**Short name:** CCEP.
**Scope:** engineering continuity, custody, review independence, evidence, owner checkpoints, and phase transitions.

CCEP means **Cross-Agent Continuous Engineering Protocol**. It governs how long-running FreightOS engineering work is handed across agents, sessions, worktrees, review phases, and owner checkpoints.

CCEP is complementary to FreightOS architecture, security, privacy, tenant-isolation, authority, resilience, scope, and non-regression governance. It does not supersede repository technical policy, accepted ADRs, module-state authority, CI gates, signed production gates, or owner rulings.

The repository-native CCEP package is durable protocol. It must not store live transient session state. Live operational state belongs in the external CCEP sidecar selected by the owner or orchestrator for the active phase.

## 1. Roles

CCEP separates **AGENT_IDENTITY** from **ENGINEERING_ROLE**.

An agent identity is the concrete tool, model family, provider, human, or automation that performs work. An engineering role is the protocol authority assigned for a phase. The same agent identity may hold different engineering roles in different isolated phases when the no-self-clearance and review-class rules are satisfied.

Vendor-neutral engineering roles:

| Role                 | Responsibility                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| OWNER                | Reserves final authority over scope, push, merge, deployment, infrastructure, production configuration, and acceptance of blocking known limitations. |
| ORCHESTRATOR         | Maintains live coordination, assigns roles under owner authority, routes execution mode, and keeps sidecar state current.                             |
| IMPLEMENTER          | Produces a candidate change within approved scope and may declare `READY_FOR_INDEPENDENT_REREVIEW`.                                                   |
| INDEPENDENT_REVIEWER | Reviews an immutable candidate without authoring or repairing it in the reviewed context.                                                             |
| TAKEOVER_AGENT       | Reconstructs custody from repository evidence, sidecar state, and phase reports at the start of a new session.                                        |
| RELEASE_VERIFIER     | Revalidates immutable candidate identity, remote integration state, CI, and base-branch conditions before owner merge decisions.                      |
| MERGE_EXECUTOR       | Performs only owner-authorized push, merge, or post-merge verification actions, within the explicitly granted boundary.                               |

## 2. No Self-Clearance

Implementation output, independent review output, and owner decision are different authorities:

```text
IMPLEMENTER_RESULT != INDEPENDENT_REVIEW_RESULT != OWNER_DECISION
```

An implementer may report `IMPLEMENTED` and `READY_FOR_INDEPENDENT_REREVIEW`. The authoring context must not independently claim final acceptance of its own material change.

An independent reviewer may classify findings, close findings under the applicable review class, or return the candidate for remediation. Review closure is not merge authority.

The owner controls merge, deployment, production-impacting authority, and acceptance of blocking known limitations.

## 3. Execution-Mode Routing

Execution mode is explicit protocol state. It must be assigned by the owner or orchestrator and must not be inferred from time passing, provider preference, model availability assumptions, or prior phases.

Valid execution modes are:

| Mode                    | Meaning                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SINGLE_PROVIDER_ONLY`  | Only the owner-authorized provider or agent family may be assigned work. Level A review remains available through isolated non-authoring sessions. |
| `CROSS_AGENT_AVAILABLE` | More than one provider or agent family is explicitly enabled by the owner. Level B review is preferred when practical.                             |
| `CODEX_ONLY`            | Compatibility alias for a single-provider route where Codex is the only currently enabled implementation of agent roles.                           |

Provider names are route selections, not architecture dependencies. CCEP is vendor-neutral.

## 4. Review Classes

### LEVEL_A_ISOLATED_SESSION_REVIEW

Level A requires:

- fresh non-authoring context or session
- same agent or model family permitted
- reviewer did not author the candidate in that context
- candidate immutable
- reviewer operates read-only on the target
- disposable validation allowed externally
- reviewer may independently determine closure under Level A
- review must not be described as cross-model review

Level A keeps engineering moving when an alternate provider is unavailable. It never allows the authoring context to self-clear.

### LEVEL_B_CROSS_AGENT_REVIEW

Level B requires:

- different implementation and review agent where practical
- immutable candidate
- reviewer does not modify the target
- stronger independence classification than Level A

Level B is preferred when available and explicitly enabled by the owner. It also does not create merge authority.

## 5. Phase State Machine

Normal phase transitions:

```text
TAKEOVER
-> REVIEW
-> REMEDIATION_REQUIRED
-> REMEDIATION
-> READY_FOR_INDEPENDENT_REREVIEW
-> INDEPENDENT_REREVIEW
-> REMEDIATION_REQUIRED
```

or:

```text
INDEPENDENT_REREVIEW
-> READY_FOR_OWNER_MERGE_DECISION
-> REMOTE_INTEGRATION_VERIFICATION
-> READY_FOR_OWNER_FINAL_MERGE_DECISION
-> OWNER_AUTHORIZED_MERGE
-> POST_MERGE_VERIFICATION
-> COMPLETE
```

Silent phase skipping is forbidden. A phase may advance only when its predecessor has produced the required custody evidence, command ledger, finding ledger updates, and next permitted phase.

Any contradiction in custody, authorization, integrity, provenance, completeness, execution reachability, policy, workflow enforcement, or identity fails closed to `NOT_PROVEN`.

## 6. Git Chain Of Custody

Every phase begins by recording:

```text
REPOSITORY
WORKTREE_PATH
BASE
START_HEAD
START_TREE
BRANCH
WORKTREE_STATUS
ANCESTRY
```

Every phase ends by recording:

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

Repository identity is not worktree identity. A FreightOS repository may have multiple linked worktrees with different branches, detached candidates, and evidence-preservation responsibilities.

At takeover/start, when multiple worktrees may exist, the receiving session must run:

```bash
git worktree list --porcelain
```

Never assume the primary worktree is the active candidate worktree. No checkout, reset, branch move, rebase, or history repair may be performed merely to make a primary worktree match a candidate that already exists elsewhere.

Git object identity overrides sidecar claims when they conflict.

## 7. Candidate Freeze And Reviewer Immutability

When a candidate enters independent review, record exact HEAD and tree.

The reviewer must not:

- edit tracked target files
- stage
- commit
- amend
- rebase
- reset
- squash
- repair findings directly in the target

The reviewer may:

- inspect
- run deterministic validation
- create disposable copies or worktrees
- construct negative fixtures there
- report findings

Review behavior is:

```text
detect -> reproduce -> classify -> report
```

It is not:

```text
detect -> fix -> review own fix -> approve
```

## 8. Evidence Hierarchy

Evidence is ordered from strongest to weakest:

1. executed deterministic evidence
2. Git object identity
3. deterministic test or gate evidence
4. static repository evidence
5. independently verified phase reports
6. external coordination state
7. historical agent residue or conversation

Historical agent output may guide investigation but is not authoritative until independently confirmed. Sidecar state helps navigation and continuity; it never overrides actual repository evidence.

## 9. Durable Findings

Material findings receive durable IDs. A finding must not disappear merely because a later report omits it.

Allowed finding lifecycle states:

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

Split, merge, rename, or replacement requires explicit lineage that names old and new IDs. `CLOSED` requires closure authority and evidence. `DEFERRED_BY_OWNER` requires owner decision evidence.

## 10. Regression Before Closure

Material closure requires evidence of:

- prior failure condition
- corrected invariant
- positive control
- negative control
- regression
- relevant gate or test
- independent review where required

A green pre-existing suite alone is insufficient for closure.

## 11. Negative Fixture Isolation

Destructive or negative validation must use:

- `mkdtemp`
- disposable worktrees
- temporary repository copies
- test-owned fixtures

Never destructively mutate:

- accepted handoff packages
- frozen review targets
- production state

## 12. Fail-Closed Rule

If a governed property cannot be established, use `NOT_PROVEN` rather than inferred `PASS`.

This applies to:

- authorization
- integrity
- provenance
- completeness
- execution reachability
- policy
- workflow enforcement
- identity

## 13. Permission Model

Permission classes:

| Class                  | Boundary                                                                         |
| ---------------------- | -------------------------------------------------------------------------------- |
| P0 READ_ONLY           | Inspect repository, sidecar, logs, reports, and metadata without mutation.       |
| P1 LOCAL_EXECUTION     | Run deterministic local commands using existing dependencies and local services. |
| P2 DISPOSABLE_MUTATION | Mutate only temporary copies, disposable worktrees, or test-owned fixtures.      |
| P3 REPOSITORY_WRITE    | Modify repository files, stage, or commit in the active worktree.                |
| P4 EXTERNAL_MUTATION   | Mutate external systems or durable state outside the repository.                 |

These authorities remain separately authorized:

```text
NETWORK
DEPENDENCY_INSTALL
PUSH
MERGE
DEPLOY
INFRASTRUCTURE_MUTATION
```

Permission at one level must not silently imply unrelated external authority.

## 14. Push, Merge, And Deploy Separation

```text
LOCAL_ACCEPTANCE does not imply PUSH
PUSH does not imply MERGE
REMOTE_CI_PASS does not imply MERGE
MERGE does not imply DEPLOY
```

Owner authority is explicit at each required boundary.

## 15. Usage Or Session-Limit Handoff

When an agent or session approaches a usage, context, or time limit:

- stop beginning broad new work
- finish the smallest safe atomic unit
- verify Git state
- write a handoff
- record incomplete work
- record permissions
- record frozen target status
- record exact next action

The receiving session begins as `TAKEOVER_AGENT`. It reconstructs from repository evidence, protocol state, sidecar state, handoffs, and reports rather than requiring the owner to explain the entire project again.

## 16. Sidecar Relationship

The repository-native CCEP package is the durable protocol.

The external sidecar is live operational state and is intentionally not committed as repository state. The sidecar may contain:

- current phase
- exact active worktree
- current SHA and tree
- active role
- permissions
- current findings
- immutable phase reports
- handoffs
- state snapshots

The repository protocol must not require the sidecar to be committed to Git. The sidecar never overrides actual repository evidence.

## 17. Phase Report Contract

Every phase report should preserve:

```text
CHAIN_OF_CUSTODY
ROLE
REVIEW_CLASS
PHASE
PERMISSIONS
SCOPE
FINDING_LEDGER
EVIDENCE
COMMAND_LEDGER
KNOWN_LIMITATIONS
REMAINING_WORK
FINAL_GIT_STATE
NEXT_PERMITTED_PHASE
VERDICT
```

`REVIEW_CLASS` may be `NOT_APPLICABLE` for non-review phases.

## 18. Owner Checkpoints

Owner-reserved decisions include:

- merge
- deployment
- force push
- branch deletion where evidence could be lost
- production configuration
- remote CI or security configuration
- infrastructure changes
- acceptance of blocking known limitations
- scope changes that materially alter accepted architecture or product behavior
