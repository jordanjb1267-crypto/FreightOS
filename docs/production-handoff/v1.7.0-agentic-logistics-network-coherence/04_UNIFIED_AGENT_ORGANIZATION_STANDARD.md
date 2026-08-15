# 04 — Unified Agent Organization Standard

## Universal factory

```text
Participant Operational Twin
+ Participant Profile
+ Enabled Capability Packs
+ Integration Bindings
+ Policy / Legal Plane
+ Autonomy Grants
+ SLO / Deployment Tier
        ↓
Tenant Agent Organization
```

## Universal agent manifest

Every production agent has:
- immutable agent ID;
- tenant;
- represented participant/legal entity;
- role;
- manifest version;
- scope;
- allowed reads;
- allowed proposals;
- allowed commands;
- tools;
- financial/exposure limits;
- legal plane;
- policy version;
- autonomy by action;
- model policy;
- evaluation version;
- expiry/review;
- kill switch.

## Logical vs runtime agents

Logical responsibilities remain separate even when one runtime worker performs many duties for a small customer.

This gives:
- simple UX for small customer;
- enterprise governance internally.

## Agent communication

Typed artifacts:
- Observation
- Request
- Proposal
- Quote
- Counter
- Tender
- ApprovalRequest
- CommandRequest
- Result
- Exception
- EvidenceReference.

Free-form agent conversations may support reasoning but cannot be execution authority.

## Cross-company boundary

Agent A never directly acquires Agent B's permissions.

Each side independently:
- authenticates;
- evaluates policy;
- decides;
- executes within its own authority.
