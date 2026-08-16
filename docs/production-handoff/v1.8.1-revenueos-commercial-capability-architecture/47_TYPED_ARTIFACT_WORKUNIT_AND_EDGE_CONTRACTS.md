# 47 — Typed Artifact, WorkUnit and Edge Contract Standard

## Purpose

Graph topology is not sufficient. Every node transition must be backed by versioned WorkUnit and handoff envelopes so ownership, evidence, authority, expiry, and stale-version behavior survive retries, restarts, and cross-plane transfer.

## WorkUnit envelope

The audit-candidate schema is `schemas/graph-workunit-envelope.schema.json`. A WorkUnit binds the exact graph/version/node, one owner, tenant and represented participant/legal plane, deadlines, input/policy references, approval/entitlement/autonomy references when relevant, retry state, idempotency key when relevant, and an audit correlation ID.

## Handoff envelope

The audit-candidate schema is `schemas/graph-handoff-envelope.schema.json`. A handoff binds exact source/target graph and node, source WorkUnit, tenant/participant, artifact type/version, payload/evidence refs, sender manifest version, expiry, and any authority/policy references.

The receiver MUST NOT trust the sender's authority. It validates the envelope, tenant/participant, artifact version, expiry, evidence freshness, policy, and its own authority before accepting ownership.

## Artifact registry

`graphs/TYPED_ARTIFACT_REGISTRY.json` enumerates every edge artifact used by the candidate graphs and every edge on which it appears. These names are candidates only: Claude must reconcile them against the accepted v1.8 `WorkUnit`, `JobHandoff`, network artifact, approval, command, and evidence contracts. Duplicate semantic types should be merged rather than creating parallel schemas.

## Authority-bearing artifacts

An artifact labelled authority-bearing is never authority merely because the JSON exists. Final accepted authority artifacts must bind exact principal, represented organization, action, subject, version, scope/limits, policy decision, approval basis, effective/expiry time, and revocation state, and must be checked outside probabilistic models.

## Compatibility

Breaking artifact or graph changes require a new version, migration/compatibility rule, in-flight WorkUnit treatment, stale invalidation behavior, replay proof, and deprecation window. Silent semantic change under the same version is prohibited.
