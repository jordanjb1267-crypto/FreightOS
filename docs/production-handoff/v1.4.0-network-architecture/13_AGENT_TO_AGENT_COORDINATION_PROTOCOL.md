# 13 — Agent-to-Agent Coordination Protocol

## 1. Objective

Authorized agents may coordinate logistics through the same governed network as humans and systems, but they are not trusted merely because they are FreightOS agents.

## 2. Agent identity

Each agent has:

- immutable network identity;
- owner and represented organization;
- purpose and role;
- model/runtime version;
- tool allowlist;
- data scope;
- command and financial limits;
- approval policy;
- valid period;
- revocation and kill-switch state.

## 3. Allowed messages

- observation summary;
- information request;
- proposal;
- negotiation position within bounds;
- approval request;
- command request;
- escalation;
- command-result interpretation.

Free-form agent conversation is never sufficient authorization for execution.

## 4. Proposal envelope

An agent proposal includes:

- proposed action;
- affected resources;
- objective;
- supporting evidence and assumptions;
- confidence/uncertainty;
- alternatives considered;
- expected cost and operational impact;
- required approvers;
- expiration;
- agent identity and policy version.

## 5. Deterministic gate

Before execution, policy independently verifies identity, authority, limits, preconditions, conflicts, approvals, idempotency, and current state. Prompt instructions cannot alter these controls.

## 6. Negotiation

Agents may negotiate only within explicit floors, ceilings, time limits, counterparties, and terms. They must disclose machine representation when required by policy or law. Secret collusion, bid manipulation, discriminatory ranking, and unauthorized commercial disclosure are prohibited.

## 7. Memory and context

Agent memory must inherit source data classification and retention. Cross-tenant memory and unapproved model training are prohibited.

## 8. Failure behavior

On ambiguity, conflicting commands, stale context, policy service failure, or anomalous counterpart behavior, agents stop execution and escalate. They do not infer authority from urgency.
