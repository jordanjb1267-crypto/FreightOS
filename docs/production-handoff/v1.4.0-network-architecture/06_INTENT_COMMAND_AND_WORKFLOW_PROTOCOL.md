# 06 — Intent, Command, and Workflow Protocol

## 1. Separation of concepts

- **Intent:** a participant's desired outcome.
- **Proposal:** a suggested action, often produced by a human or agent.
- **Request:** an invitation for another participant to act.
- **Approval:** authorization by an eligible principal.
- **Command:** a bounded instruction to an execution handler.
- **Result:** accepted, rejected, failed, expired, cancelled, or completed outcome.

No proposal becomes a command without deterministic policy evaluation.

## 2. Command envelope

Required fields include:

- command ID and type/version;
- requester and represented organization;
- target resource and expected version;
- authority grant/policy decision reference;
- approval references;
- idempotency key;
- issued-at and expiration;
- preconditions;
- maximum financial/operational bounds;
- correlation/workflow/trace IDs;
- payload;
- compensation strategy where applicable.

## 3. Optimistic concurrency

Commands that mutate shared state must declare expected object version or explicit conflict behavior. Silent last-write-wins is prohibited for consequential logistics, authority, custody, and financial records.

## 4. Idempotency

Command handlers persist execution claims before external side effects. A repeated idempotency key returns the prior result or safely resumes the same execution; it never creates a duplicate tow, booking, payment, or approval.

## 5. Workflow model

Cross-party workflows are explicit state machines with:

- participating roles;
- entry conditions;
- state transitions;
- deadlines and timers;
- required evidence;
- approval rules;
- exceptions;
- compensation or reversal actions;
- completion and reconciliation criteria.

## 6. Saga discipline

Distributed transactions use orchestrated or choreographed sagas only where their ownership and compensation semantics are clear. Compensating an action does not imply erasing the original event.

## 7. Human control

High-consequence commands require human approval according to risk policy. Emergency action may use pre-authorized limits but must generate immediate notice, audit, and retrospective review.
