# 04 — Adaptive Workflow Graph Runtime

## 1. Principle

Every consequential automated business process is a versioned durable graph.

The graph is company-adaptable through data/configuration while preserving canonical node contracts.

## 2. Graph definition

Each workflow defines:
- workflow ID/version
- tenant
- capability pack
- trigger schema
- state schema
- nodes
- edges/conditions
- deadlines
- retry policy
- approval interrupts
- side-effect nodes
- compensations
- reconciliation
- terminal states
- degraded behavior
- evaluation suite

## 3. Node classes

### Deterministic
- auth
- tenancy
- policy
- arithmetic
- eligibility
- data validation
- state transition
- idempotency
- routing where rules suffice

### Intelligence
- classify
- summarize
- extract
- rank
- plan
- draft
- interpret ambiguity

### Human interrupt
- approve/reject
- correct
- select
- attest exception

### Side effect
- mutate TMS
- send message
- create assignment
- request roadside
- book appointment
- submit document
- financial instruction where authorized

### Verification/reconciliation
- read-after-write
- external ID confirmation
- business-state confirmation
- timeout/compensation

## 4. Canonical execution pattern

```text
Trigger
  ↓
Load authoritative state
  ↓
Validate tenant/identity
  ↓
Interpret/plan where needed
  ↓
Deterministic feasibility
  ↓
Policy/authority gate
  ↓
Approval interrupt if required
  ↓
Idempotency lock
  ↓
Side effect
  ↓
Verify external result
  ↓
Record event/evidence
  ↓
Reconcile
  ↓
Next node / terminal
```

## 5. Company adaptation

Do not alter graph safety structure per customer.

Customer configuration may control:
- thresholds
- routing targets
- escalations
- office hours
- preferred vendors
- acceptable modes
- asset pools
- approval owners
- communication templates
- operational priorities
- side-effect adapter binding.

A customer cannot configure away constitutional security gates.

## 6. Durable execution

Graph runtime must survive:
- process restart
- worker loss
- provider outage
- integration timeout
- duplicate event
- delayed approval
- failover to another worker/cell where supported.

Checkpoints occur before and after external side effects.

## 7. Exactly-once business effect

Transport may be at-least-once.
Business effect must be idempotent/reconcilable.

Idempotency key should bind:
tenant + workflow + command + resource + relevant version.

## 8. Deadlines

Every consequential graph declares:
- SLA
- decision deadline
- command deadline
- approval expiration
- retry budget
- escalation deadline.

No infinite autonomous loop.

## 9. Graph introspection

Customer/operator can inspect:
- current node
- why it is there
- evidence
- pending approval
- next possible actions
- authority
- elapsed time
- failures
- replay/recovery status.

## 10. Graph mutation tests

CI must fail if:
- side effect can bypass policy;
- a new edge bypasses approval;
- a retry loop is unbounded;
- a graph lacks terminal states;
- a command lacks idempotency;
- tenant context can be client-supplied without verification;
- intelligence output directly becomes authority.
