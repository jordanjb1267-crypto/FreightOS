# 14 — Human Approval, Exceptions, and Escalation

## 1. Human-in-command model

Humans define policy and approval boundaries. Automation operates inside those boundaries and must expose enough context for meaningful oversight.

## 2. Risk-tiered approval

### Tier 0 — Read/observe

No external side effect; normal authorization still applies.

### Tier 1 — Reversible low-impact

May execute automatically within bounded policy, with audit and notification.

### Tier 2 — Material operational

Examples: appointment change, provider dispatch, load reassignment. Requires designated approval or explicit pre-authorization.

### Tier 3 — Financial/legal/safety critical

Examples: bank-account change, title/custody control, major repair, hazardous-goods exception, regulatory representation. Requires step-up verification and often dual control.

## 3. Approval record

Approvals bind:

- approver identity and organization;
- exact action and resource version;
- limits and conditions;
- expiration;
- evidence presented;
- authentication assurance;
- policy decision;
- revocation/cancellation state.

## 4. Exception types

- operational delay;
- conflicting participant reports;
- missing evidence;
- authorization failure;
- integration failure;
- safety risk;
- financial discrepancy;
- data-quality conflict;
- suspected fraud;
- legal/regulatory hold.

## 5. Escalation

Escalation routes by severity, ownership, time sensitivity, and business relationship. The system must avoid alert flooding and preserve a clear accountable owner.

## 6. Emergency mode

Emergency actions require pre-defined scopes and maximums. They must not become a bypass for ordinary approval. Every emergency execution triggers immediate audit, notification, and retrospective review.
