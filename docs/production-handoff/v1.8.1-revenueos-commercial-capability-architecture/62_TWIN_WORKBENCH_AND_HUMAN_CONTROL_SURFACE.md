# 62 — Twin Workbench and Human Control Surface

## Purpose

The Operational Twin must be usable as a workforce multiplier, not only as infrastructure for autonomous agents.

## Core surfaces

### My Work
WorkUnits owned by the human, prioritized by deadline/risk/business value.

### Agent Work
Visible work being handled by agents/services, with state, owner, deadline, evidence and ability to interrupt where authorized.

### Needs Approval
Exact-version proposals with summarized action, consequence, evidence, policy basis, expiry and approve/reject/modify paths.

### Exceptions
Conflicts, stale integrations, uncertain external writes, network disputes, SLA breaches and unsupported cases.

### Network Inbox / Outbox
Business artifacts grouped by shipment/visit/service case/counterparty, with acknowledgement/reconciliation—not a generic chat feed.

### Systems & Sync
Connected systems, authority bindings, freshness, last successful synchronization, mappings, degraded state and kill switches.

### Twin Knowledge
Approved operational facts/SOPs/configuration, provenance, pending proposals, corrections and semantic diffs.

### Workflow Modes
Per-workflow customer-facing mode plus the stricter effective certification/autonomy state. Changing the UI mode cannot itself change authority.

### Evidence / Audit
Who/what acted, why, what source was used, what was sent, what happened externally, and whether reconciliation closed.

## UX doctrine

- role-aware, not agent-centric;
- exception-first at scale;
- explain source/freshness/confidence;
- make automation interruptible where policy allows;
- never hide degraded/stale state behind a confident model response;
- customers should not need to understand graph IDs to operate the system;
- enterprise administrators may inspect the underlying graph/authority/configuration contracts.

## Workforce transition

The same interface should remain usable as a customer progresses from human-heavy to autonomous operation. The queue composition changes; the underlying objects, evidence, policies, and network relationships do not need to be rebuilt.
