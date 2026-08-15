# 01 — Role Decomposition and Agent Minimization

## Principle

The quality of FreightOS is not measured by the number of agents. Each component must have the smallest cognitive and authority scope needed for its responsibility.

### Deterministic service
Use for arithmetic, eligibility rules, exact clocks, schema validation, authorization, idempotency, fixed routing, and state transitions.

### Hybrid agent
Use where deterministic hard gates coexist with ambiguity, ranking, planning, or communication.

### Agent
Use where the job genuinely requires contextual planning, negotiation, multi-party coordination, exception resolution, or adaptive communication.

### Human-supervised agent
Use where AI can prepare/coordinate but final high-risk authority remains human or deterministic.

Every proposed agent must include an alternative analysis: deterministic service, workflow node, existing job, or human-only.
