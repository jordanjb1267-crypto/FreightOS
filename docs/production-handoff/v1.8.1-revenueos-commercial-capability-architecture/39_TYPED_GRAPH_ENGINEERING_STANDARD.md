# 39 — Typed Graph Engineering Standard

## Status and precedence

This is an additive **audit-candidate** graph standard for RevenueOS and Freight Market Intelligence (FMI). It does not replace accepted v1.3–v1.8 authority, WorkUnit, Job Book, network, or certification rules. Where a conflict exists, the stricter accepted rule controls and Claude must record the conflict.

## Required graph contract

Every consequential RevenueOS/FMI workflow MUST be represented as a typed durable graph. A sequence diagram, prompt chain, agent chat, cron job, queue consumer, or UI state machine is not sufficient by itself. Each graph must declare:

1. immutable graph ID and version;
2. canonical WorkUnit type and trigger;
3. one accountable owner for every active state;
4. state/node IDs;
5. entry preconditions and exit postconditions;
6. typed edge artifact;
7. edge guard;
8. independent authority check where relevant;
9. side-effect class;
10. timeout/deadline;
11. retry policy;
12. reconciliation rule;
13. stale-version invalidation rule;
14. failure transition;
15. terminal states;
16. graph-level invariants;
17. audit/evidence requirements;
18. kill-switch behavior;
19. certification and replay fixtures.

## Ownership invariant

Exactly one job/service/human role is accountable for a WorkUnit state at one time. Multiple components may contribute evidence, but shared accountability is prohibited. Ownership transfers only through a typed edge whose receiving preconditions pass.

## Typed edges, not chat

Every handoff carries a typed artifact and explicit version. Free-form text may be attached as evidence but cannot itself represent approval, authority, entitlement, command, source rights, or a binding commercial term.

## State transition discipline

A transition is valid only when:

`current state/version + required evidence + guard + receiver preconditions + independent policy/authority = permitted next state`.

No model output can replace deterministic policy/authority checks.

## Side-effect discipline

External communication, commercial offers, CRM mutations, entitlement intents, financial records, market publications, and logistics commands are separately classified side effects. Each binding side effect requires an idempotency key or an explicit non-repeatable protocol, durable result evidence, and reconciliation before retry when outcome is uncertain.

## Version invalidation

A WorkUnit/proposal/approval must be invalidated when a material referenced object changes and the graph declares that dependency binding. Examples: catalog version, price policy, source-rights status, customer configuration, Operational Twin fact, approval scope, forecast input snapshot, seller authority, or entitlement version.

## Cross-plane rule

RevenueOS, FMI, and operational participant workforces are separate authority planes. A typed artifact may cross a boundary; permissions do not. The receiver evaluates its own identity, policy, authority, freshness, and approval rules.

## Graph admission

No graph becomes production-valid because it appears in this package. Claude must map it against existing runtime/workflow constructs and accepted v1.5–v1.8 contracts. Owner acceptance can promote a surviving candidate to J0 specification; implementation/certification follows separately.
