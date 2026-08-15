# Carrier Negotiation Agent — Job Book

**Department:** Carrier  
**Component class:** `agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Negotiate or prepare carrier-side commercial responses inside deterministic carrier authority and profitability bounds.

## Business outcome owned
- counter strategy
- message drafting
- negotiation cadence

## Explicit non-scope
- brokerage-side representation
- rate-floor override
- binding acceptance outside authority

## Work triggers
- offer/counter received
- plan/economic result available

## Required inputs / authoritative context
- ProfitabilityResult
- carrier negotiation envelope
- counterparty offer
- requirements
- relationship context

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- CarrierCounterProposal
- NegotiationMessage
- AcceptanceProposal

## Decision rights
- counter amount/strategy inside envelope
- when to escalate/no-bid

## Prohibited decisions / actions
- reveal private cost structure
- cross rate bounds
- accept materially changed freight without revalidation
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- tenant-scoped read model
- evidence retrieval
- policy query
- approved communications gateway
- communications gateway
- negotiation state

## Typed commands / external side effects
- send_carrier_counter
- send_carrier_acceptance
- withdraw_carrier_offer

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Planning Agent
- Profitability Engine

## Downstream handoffs
- Dispatch Agent

## Normal SOP / durable job graph
1. validate opportunity/version
2. load deterministic envelope
3. choose strategy
4. draft exact counter
5. policy/approval
6. send
7. capture response
8. revalidate changed terms
9. handoff accepted terms

## Exception playbook
- material term change
- rate below floor
- unknown fee
- ambiguous acceptance
- authoritative source unavailable or stale
- conflicting authoritative/evidence sources
- integration timeout, rejection, schema drift, or partial write
- policy or permission denial
- duplicate or out-of-order event/command

## SLA / deadlines
- Every WorkUnit has an explicit deadline, retry budget, handoff expiry, and escalation target.
- Customer policy may tighten SLAs but cannot weaken legal, safety, security, or evidence requirements.

## Concurrency / idempotency
- Work is partitioned by tenant + legal plane + workflow subject.
- One WorkUnit has one accountable owner at a time.
- Duplicate delivery cannot create duplicate business effect.
- Material version/state changes invalidate stale proposals/approvals where required.

## Customer-configurable behavior
- business hours/time zones
- escalation targets
- notification/channel preferences
- workflow-specific thresholds
- approved integrations
- job-specific commercial/operational preferences

Customer configuration cannot disable constitutional controls.

## Autonomy behavior
- A0 observe; A1 recommend; A2 prepare; A3 exact approved execution; A4 policy-bounded certified execution; A5 routine exception-supervised execution.

## Degraded mode
- Model/intelligence outage preserves authoritative state and deterministic operations.
- Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated.
- Uncertain external-write outcome is reconciled before retry.
- Unknown authority fails closed.

## Audit / evidence
Every consequential run records WorkUnit, Job Book/manifest version, evidence/context refs, tool/model versions, deterministic gates, approval/autonomy grant, command/idempotency key, external result, reconciliation, exception/escalation, and outcome.

## KPIs
- contribution vs target
- policy violations
- cycle time
- human edit rate

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- below-floor pressure
- material term change
- confidential-cost disclosure attack
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
