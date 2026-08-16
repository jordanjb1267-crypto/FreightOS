# 52 — Human + Agent Coexistence and Workforce Augmentation

## Goal

FreightOS must create value before full autonomy. The system SHALL support an existing workforce using the Operational Twin as an added employee base, analyst, coordinator, dispatcher assistant, document team, exception desk, or communication layer without forcing organizational replacement.

## Experience modes

These are customer-facing operating modes, not replacements for accepted autonomy/certification levels. Effective authority is still the minimum permitted by Job certification, graph certification, A-level/action grant, policy, approval, legal plane, command permission, and current state.

| Mode | Customer experience | Side effects |
|---|---|---|
| `OBSERVE` | Twin watches, normalizes, summarizes, detects | none |
| `ASSIST` | drafts, recommends, retrieves, prepares | none unless a separate authorized deterministic action exists |
| `COLLABORATE` | human and agent share a WorkUnit; agent performs bounded subwork | only independently authorized sub-actions |
| `APPROVAL_EXECUTE` | agent prepares exact action; authorized human/service approves exact version | approved command only |
| `BOUNDED_AUTONOMY` | certified graph executes permitted action classes within current grants | bounded commands only |

Mode is set **per workflow/action**, not globally per customer.

## Shared WorkUnit doctrine

One WorkUnit has one accountable owner at a time. Human and agent participation is represented as explicit ownership/handoff, contribution, review, or approval events—not ambiguous shared ownership.

A human may:

- take ownership;
- edit a draft;
- reject a recommendation;
- request more evidence;
- approve an exact proposal;
- override when policy permits;
- place a WorkUnit on hold;
- escalate;
- return ownership to an agent/job.

An agent may not treat a human's free-text chat as a permission grant unless it is converted into the accepted typed approval/command contract by the deterministic authority layer.

## Workforce augmentation UX

The Twin workbench should expose role-specific queues rather than requiring users to converse with a chatbot for every task:

- work queue;
- exceptions;
- approvals;
- drafts ready for review;
- network inbox/outbox;
- stale integration warnings;
- customer/Twin change proposals;
- recommended next actions;
- evidence and rationale;
- SLA/deadline status;
- handoff/ownership history.

## Human learning loop

Repeated human behavior may generate a candidate pattern. It may not silently become policy.

```text
Observed human action
→ pattern candidate
→ evidence window
→ proposed Twin/SOP/config change
→ impact analysis
→ authorized customer review
→ APPROVED or REJECTED
→ versioned Twin change
→ affected graph/agent re-evaluation
```

## Mixed-maturity customer example

A carrier may run:

- document ingestion/status = bounded autonomous;
- load scoring = assist;
- dispatch assignment = approval-execute;
- customer exception communication = collaborate;
- repair authorization = human-led;

The Twin remains one coherent operating context across all five.
