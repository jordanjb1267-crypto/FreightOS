# 10 — Autonomy Certification and Shadow Mode

## 1. Principle

Autonomy is a measured capability, not a subscription toggle.

## 2. Stages

### A0 Observe
Read-only.

### A1 Recommend
Produces recommendation/explanation.

### A2 Prepare
Creates draft action/document/message/plan but cannot execute.

### A3 Approval-to-Execute
Human approves exact side effect.

### A4 Policy-Bounded Autonomy
Executes listed actions inside explicit policy.

### A5 Exception-Supervised
Routine flow is autonomous; humans own exceptions/high-risk decisions.

## 3. Shadow certification

Before A3+:
- run workflow against real or representative events without external side effects;
- compare FreightOS output to human/operator outcome;
- measure agreement and error classes;
- require minimum sample;
- include edge cases;
- include integration failure;
- include stale/missing data;
- include conflict/exception;
- customer operations owner reviews.

## 4. Evaluation dimensions

- factual grounding
- system-of-record fidelity
- eligibility/feasibility correctness
- policy compliance
- assignment quality
- SLA timeliness
- exception detection
- escalation correctness
- communication quality
- side-effect correctness
- reconciliation
- customer override rate.

High aggregate accuracy cannot hide a safety/authority failure.

## 5. Promotion

Promotion record includes:
- tenant
- workflow
- command/action class
- scope
- evaluation version/results
- policy version
- approver
- limits
- expiration/review date.

## 6. Automatic downgrade

Downgrade/pause on:
- material policy change
- integration schema change
- COT drift
- evaluation regression
- security incident
- unexplained override spike
- side-effect mismatch
- stale authoritative data
- customer request.

## 7. Canary

Large enterprises:
- one workflow
- one terminal/fleet/region
- selected shift
- limited transaction count
before expansion.

## 8. One-truck fast path

Small customers need not endure enterprise bureaucracy, but safety gates remain.

Fast path:
- minimal COT
- connector test
- 1–3 day or sufficient-volume shadow
- owner confirms behavior
- approve narrow A3/A4 actions.

Autonomy never skips authority/idempotency/reconciliation.
