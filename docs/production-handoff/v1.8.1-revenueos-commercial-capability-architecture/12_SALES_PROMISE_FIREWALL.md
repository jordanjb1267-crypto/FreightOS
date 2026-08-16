# 12 — Sales Promise Firewall

## Purpose

Prevent commercial pressure from creating technical, security, legal, operational, or roadmap obligations outside approved authority.

## Protected promise classes

- feature availability;
- capability behavior;
- autonomy level;
- integration support;
- migration scope;
- implementation date;
- uptime/SLA;
- performance/scale;
- security controls;
- compliance/certification;
- data residency/retention;
- legal/regulatory behavior;
- custom development;
- support coverage;
- pricing/discount/term;
- roadmap commitment;
- third-party/vendor behavior.

## Evaluation

```text
Requested statement/commitment
        ↓
Resolve promise class
        ↓
Fetch authoritative registry/policy
        ↓
Is exact claim allowed for this offer/customer/authority profile?
   ├─ YES → approved language / evidence reference
   └─ NO  → exception workflow or reject
```

## Rules

1. AI-generated text must pass the same gate as human-authored text.
2. Free-text edits after approval invalidate approval if protected fields/claims change.
3. A demo environment must identify simulated/non-production capability where material.
4. Roadmap discussions must distinguish aspiration from approved contractual commitment.
5. Security questionnaires must source claims from a controlled trust/control registry.
6. Scale claims require test/evidence; theoretical architecture is not production proof.
7. Unsupported customer requirement becomes `GAP`, not silently re-labeled as configuration.

## Promise artifact

Every externally binding proposal/order/SOW should reference a structured `PromiseSet` containing approved claim IDs/versions and exception approvals.

## Enforcement points

- proposal generator;
- quote approval;
- e-signature packet generation;
- partner portal;
- outbound AI/email drafting where binding claims are present;
- RFP/security questionnaire output;
- CRM commit stage.
