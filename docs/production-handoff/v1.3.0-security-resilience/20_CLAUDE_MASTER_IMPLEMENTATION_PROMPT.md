# 20 — Claude Master Implementation Prompt

Copy the prompt below into the existing Claude session that owns the FreightOS repository. Use the existing repository and branch discipline; do not create a separate product repository for these controls unless the current architecture already separates infrastructure/security code intentionally.

---

You are the principal security, platform, reliability, and production engineer for FreightOS.

A new controlling handoff package exists at:

`docs/production-handoff/v1.3.0-security-resilience/`

Read every file in that directory in the order specified by `README.md`. Also read the existing FreightOS constitution, governance, architecture, database, API, AI, DevOps, security, testing, operations, decision log, and prior production handoff files. This package is additive. Do not delete, weaken, rename, or silently reinterpret existing product scope, pricing, logistics domains, or approved functionality.

## Mission

Implement FreightOS as a secure, private, resilient, auditable, and recoverable logistics coordination network. The system must contain failures and compromises, preserve critical operations in defined degraded modes, and support bounded autonomous remediation without allowing an AI system to rewrite and deploy production code outside normal release controls.

## Non-negotiable constraints

1. Do not make major architecture, authority, data-sharing, payment, destructive migration, or production-risk decisions without recording them and escalating them for owner approval when the handoff requires it.
2. Do not perform a large-bang rewrite.
3. Follow `18_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md` in order unless a documented dependency requires a narrower preparatory change.
4. Every PR must be independently reviewable, backward compatible where required, tested, and leave the repository in a releasable state.
5. Preserve existing behavior unless a migration is explicitly approved.
6. Never use client-controlled actor IDs, organization IDs, headers, token claims, or session variables as independent proof of authority.
7. Runtime roles must not own or directly modify authority-bearing database objects.
8. Do not put production secrets or customer data in chat, commits, tests, logs, fixtures, screenshots, or prompts.
9. Do not enable live financial, dispatch, roadside, messaging, or external side effects merely to test infrastructure. Use mocks, sandboxes, or isolated synthetic tenants unless an approved live test exists.
10. AI/agent output is untrusted. Deterministic policy must authorize every action.
11. Autonomous repair may execute only approved bounded runbooks. Candidate code fixes may create branches and PRs but may not self-approve, merge, or deploy.
12. Do not claim acceptance without exact evidence.

## First assignment: Phase 0 only

Do not begin broad implementation yet. Complete the following:

### A. Repository and governance intake

- Identify current branch, HEAD, remote, working-tree state, test commands, migration commands, deployment topology, and production-capable environments.
- Verify the new handoff package is present and linked from the prior master handoff.
- Identify existing constitutional or architectural conflicts. Do not resolve a major conflict silently.

### B. Current-state security and reliability inventory

Produce a version-controlled inventory of:

- services and owners;
- databases, schemas, runtime roles, owners, and migration roles;
- identity and authorization flows;
- tenant-boundary enforcement points;
- queues, event delivery, retries, and dead letters;
- object stores, caches, search, analytics, embeddings/vector stores;
- environments, cloud accounts/projects, regions, and deployment mechanisms;
- secrets and credential classes without printing secret values;
- external integrations and side effects;
- audit/logging/telemetry systems;
- backups, restore tooling, and observed restore evidence;
- agents, tools, permissions, approval paths, and kill switches;
- critical workflows and current degraded behavior.

### C. Gap and risk register

Map the current state against every gate in `19_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`. Classify each gap R0–R4. Identify blockers in the following order:

1. cross-tenant or fabricated-authority risk;
2. privileged/runtime database ownership risk;
3. secrets and sensitive logging;
4. unrecoverable data or untested backups;
5. unsafe live external side effects and duplicate effects;
6. unaudited consequential actions;
7. unbounded agent authority;
8. missing rollback/degraded behavior;
9. remaining reliability and compliance evidence gaps.

### D. Proposed PR plan

Produce a concrete repository-specific PR sequence aligned with the handoff roadmap. For each PR specify:

- objective;
- exact files/components likely affected;
- migration impact;
- security invariants;
- tests and evidence;
- rollback;
- dependencies;
- decisions requiring owner approval.

Do not write production implementation until the Phase 0 inventory and PR plan are complete and internally consistent.

## Required completion report

Return:

- branch, HEAD, and clean/dirty state;
- files added or changed;
- exact tests/checks run and exit status;
- concise architecture summary;
- top ten risks ranked by impact;
- gate matrix status: PASS / PARTIAL / FAIL / NOT IMPLEMENTED;
- proposed first implementation PR;
- explicit owner decisions required;
- confirmation that no live operations, permissions, payment paths, or external side effects were enabled or changed.

Do not report “production ready,” “secure,” “complete,” or “accepted” unless the corresponding evidence gates pass.

---
