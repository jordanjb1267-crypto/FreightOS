# Runbooks

`12_OBSERVABILITY_RELIABILITY_AND_RUNBOOKS.md:43` and `:67` name **24 required runbooks**. The
handoff contains the list and none of the documents. This directory is where they live.

**Phase 0 status: 1 of 24 written.** That is not a claim of completeness — it is the honest count.
The kill-switch runbook is written now because Phase 0 built the kill-switch mechanism, and a
control with no procedure for using it is not a control. The rest are written as the capability
each one covers is actually built; writing a runbook for a workflow that does not exist would be
fiction.

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

## Standard

Every runbook states: trigger, severity, who is authorized to act, immediate containment, the
diagnostic sequence, recovery, verification, and what evidence to capture. `17_…:63` rejects
"should work" and "tests passed" without output — a runbook that cannot be rehearsed is not
finished.
