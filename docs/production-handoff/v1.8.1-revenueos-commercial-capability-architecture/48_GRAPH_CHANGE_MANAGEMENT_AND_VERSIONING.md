# 48 — Graph Change Management and Versioning

## Immutable versions

A graph version is immutable once accepted. Changing node ownership, edge semantics, authority guard, side-effect class, artifact semantics, retry/reconciliation behavior, or terminal state requires a new graph version.

## Change classes

- `PATCH_METADATA`: description/evidence links only; no execution semantics.
- `COMPATIBLE_ADDITIVE`: additive optional evidence/observability with compatibility proof.
- `EXECUTION_SEMANTIC`: node/edge/guard/owner/side-effect/retry change; new graph version and replay required.
- `AUTHORITY_SEMANTIC`: permission/approval/command/legal-plane change; new version plus designated authority/security review and owner approval.

## In-flight WorkUnits

A release plan must state whether an in-flight WorkUnit finishes on the prior version, is safely migrated, is invalidated/restarted, or is held for human review. Silent reassignment to the latest graph is prohibited.

## Rollout

Accepted new versions progress through replay/shadow/canary or stricter existing FreightOS release controls. Version rollout cannot increase effective autonomy merely because graph topology changed.

## Rollback

Rollback must preserve evidence and reconcile external effects. A WorkUnit already producing an externally binding effect cannot simply be replayed on an older graph without command-specific reconciliation.
