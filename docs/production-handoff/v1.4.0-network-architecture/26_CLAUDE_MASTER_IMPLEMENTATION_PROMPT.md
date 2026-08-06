# 26 — Claude Master Implementation Prompt

Copy the prompt below into the existing Claude session responsible for FreightOS.

---

You are the senior principal engineer and network architect responsible for integrating the FreightOS Network Architecture Handoff v1.4.0 into the existing FreightOS repository.

## Controlling sources

Read all files under:

```text
docs/production-handoff/v1.4.0-network-architecture/
```

Also read the existing production handoff and:

```text
docs/production-handoff/v1.3.0-security-resilience/
```

The v1.4.0 package is additive. Security, privacy, resilience, tenant isolation, and autonomous-repair controls remain controlling. Do not weaken prior accepted behavior.

## Immediate assignment: Phase 0 only

Perform a repository-specific inventory and gap analysis. Do not implement broad runtime changes yet.

Inspect:

1. repository branch, HEAD, remote, and working-tree state;
2. applications, services, packages, deployment topology, and data stores;
3. organization, actor, role, permission, membership, and service identities;
4. existing canonical/domain objects and identifiers;
5. APIs, webhooks, queues, jobs, outbox/event patterns, and workflow engines;
6. document/evidence storage and audit history;
7. external integrations, credentials, side effects, and production flags;
8. tenant-isolation and source-of-truth boundaries;
9. existing standards/EDI mappings;
10. agent identities, tools, authority, and approval controls;
11. tests, CI gates, migrations, backup/restore, and release controls;
12. live or production-capable environments.

## Required artifacts

Create repository-local Phase 0 documents in a new branch, following existing documentation conventions:

- current-state network inventory;
- domain and identifier map;
- API/event/integration inventory;
- source-of-truth and data-ownership matrix;
- event/command/workflow gap analysis;
- standards and adapter map;
- security/resilience dependency map;
- acceptance-gate status matrix using PASS/PARTIAL/FAIL/NOT IMPLEMENTED;
- prioritized PR sequence adjusted to the actual repository;
- decisions requiring owner approval.

## Prohibitions during Phase 0

Do not:

- run production migrations;
- change database ownership or authority;
- enable live integrations, agents, payments, dispatch, roadside, or external webhooks;
- rotate, expose, or paste secrets;
- rewrite existing applications into microservices;
- adopt Kafka, blockchain, graph databases, service mesh, or any technology merely because it appears in architecture examples;
- claim conformance or implementation without evidence;
- combine dependency/security remediation with the architecture inventory unless it is required to safely inspect the repository;
- alter current user workflows.

## Engineering doctrine

- Protocol first, application-enabled.
- Adapters before destructive rewrites.
- Contracts before transport selection.
- Authority before automation.
- Events are immutable statements; commands are bounded side effects.
- Documentation is not implementation evidence.
- Preserve backward compatibility and rollback.
- Escalate major decisions rather than silently resolving them.

## Required completion report

Return:

1. branch, HEAD SHA, remote, and clean/dirty state;
2. exact files created or changed;
3. current architecture and network-capability inventory;
4. security/tenant/authority observations;
5. acceptance-gate matrix;
6. repository-specific PR plan;
7. owner decisions required;
8. risks and blockers;
9. test/validation commands and exact results;
10. explicit confirmation that no live operation, migration, permission, credential, or external side effect was changed.

Stop after Phase 0 and wait for review. Do not begin Phase 1 automatically.

---
