# Runbooks

`12_OBSERVABILITY_RELIABILITY_AND_RUNBOOKS.md:43` and `:67` name **24 required runbooks**. The
handoff contains the list and none of the documents. This directory is where they live.

**Status after Phase 1 PR 2: 3 of 24 written.** That is not a claim of completeness — it is the
honest count. Each is written when the capability it covers is actually built; writing a runbook for
a workflow that does not exist would be fiction.

- The kill-switch runbook came with Phase 0's kill-switch mechanism.
- The control-plane-access runbook comes with PR 2's `admin` schema — ADR-0020 §Implementation
  obligations assigns it to PR 2, and a privileged surface with no procedure for using it is not a
  controlled surface.
- The database-migration-recovery runbook comes with PR 2's first migration that can legitimately
  refuse to revert.

## Required by `12_…:43` — core

| Runbook                       | Status                                             | Earliest phase |
| ----------------------------- | -------------------------------------------------- | -------------- |
| Incident command              | Not written                                        | 3              |
| Security event                | Not written                                        | 3              |
| Cross-tenant suspicion        | Not written                                        | 1              |
| Model or policy failure       | Not written                                        | 2              |
| Duplicate side effect         | Not written                                        | 3              |
| Integration outage            | Not written                                        | 2              |
| Database failover and restore | Not written                                        | 3              |
| Workflow backlog              | Not written                                        | 3              |
| Audit failure                 | Not written                                        | 1              |
| Billing correction            | Not written                                        | 3              |
| Broker-security alert         | Not written                                        | ≥3 (gated)     |
| **Kill switch**               | **Written** — [`kill-switch.md`](./kill-switch.md) | 0              |
| Emergency manual dispatch     | Not written                                        | 3              |

## Required by `12_…:67` — facility and autonomous mobility

All eleven are deferred with their modules and are listed for completeness: autonomous mission
hold/cancel, provider outage, remote assistance, minimal-risk event, human recovery, autonomous
cybersecurity event, facility evacuation/safety hold, gate outage, WMS/YMS outage, custody dispute,
and facility data-provenance incident.

## Additional runbooks, required by the ADRs rather than by `12_…`

| Runbook                     | Status                                                                             | Required by                        |
| --------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| Control-plane access        | **Written** — [`control-plane-access.md`](./control-plane-access.md)               | ADR-0020                           |
| Database migration recovery | **Written** — [`database-migration-recovery.md`](./database-migration-recovery.md) | ACCEPTANCE_THRESHOLDS §4, ADR-0017 |

## Standard

Every runbook states: trigger, severity, who is authorized to act, immediate containment, the
diagnostic sequence, recovery, verification, and what evidence to capture. `17_…:63` rejects
"should work" and "tests passed" without output — a runbook that cannot be rehearsed is not
finished.
