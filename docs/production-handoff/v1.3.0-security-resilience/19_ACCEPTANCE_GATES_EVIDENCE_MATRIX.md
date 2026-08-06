# 19 — Acceptance Gates and Evidence Matrix

No requirement is accepted based only on code inspection or verbal assurance. Evidence must be reproducible.

| ID | Required capability | Minimum acceptance evidence |
|---|---|---|
| SEC-01 | Trusted identity context | Tests show client-supplied actor/tenant identifiers cannot create authority |
| SEC-02 | Authority table protection | Runtime roles lack direct write privileges; controlled admin operations audited |
| SEC-03 | Cross-tenant isolation | Automated DB/API/storage/cache/search/export/vector tests deny all cross-tenant paths |
| SEC-04 | Privileged access | Separate privileged identities, MFA, JIT or bounded access, break-glass alert/review |
| SEC-05 | Secret protection | Secret scans clean; no secrets in logs/images/artifacts; rotation procedure tested |
| DATA-01 | Classification inventory | Sensitive fields/events have owners, purpose, classification, retention, sharing rule |
| DATA-02 | Logging redaction | Automated tests prove D4/D5 values are excluded or irreversibly redacted |
| DATA-03 | Deletion | Deletion propagates to active stores/indexes/caches with reconciliation report |
| AUD-01 | Append-only audit | App roles cannot edit/delete consequential audit records; event attribution complete |
| EVT-01 | Idempotency | Duplicate requests/webhooks create one business effect and stable response |
| EVT-02 | Outbox/inbox | Crash-window tests do not lose or duplicate material effects |
| EVT-03 | Reconciliation | Internal/external mismatch is detected, assigned, and resolved visibly |
| REL-01 | Criticality/SLOs | Class A/B services have SLIs, SLOs, RTO/RPO, owner, dashboard, alerts, runbook |
| REL-02 | Degraded operation | AI and at least two critical external dependencies can fail without unsafe core outage |
| REL-03 | Cell isolation | Controlled failure in one cell does not spread to a separate cell |
| REL-04 | Capacity | Load test reaches declared demand plus headroom without violating critical SLO |
| DR-01 | Backup integrity | Backup success monitored; immutable/cross-region protection shown for critical data |
| DR-02 | Restore proof | Full restore completes within objective; integrity and tenant tests pass |
| DR-03 | Regional recovery | Exercise meets measured RTO/RPO and reconciles post-failover state |
| SDLC-01 | Protected delivery | Protected branches/reviews; exact tested artifact promoted |
| SDLC-02 | Supply chain | SBOM, provenance, artifact signature, and deployment-time verification |
| SDLC-03 | Safe migration | Expand/contract test and rollback/forward-fix plan proven |
| SDLC-04 | Canary rollback | Deliberately failing canary triggers bounded rollback and verification |
| IR-01 | Incident readiness | Named roles, severity matrix, contact paths, runbooks, evidence process |
| IR-02 | Exercise | Tabletop plus technical incident exercise completed with corrective actions |
| AI-01 | Agent registry | Every enabled agent has owner, purpose, tools, limits, approvals, kill switch |
| AI-02 | Deterministic policy | Agent output alone cannot authorize tool execution |
| AI-03 | Injection resistance | Direct/indirect prompt-injection, secret, cross-tenant, and tool-abuse suites pass |
| AI-04 | Bounded remediation | Runbook scope, rollback, rate limit, audit, and kill switch proven |
| AI-05 | No self-deployment | Candidate repair can open PR but cannot approve, merge, or deploy itself |
| VEN-01 | Critical vendor review | V3 vendor security, continuity, incident, data, and exit review complete |
| VEN-02 | Connector containment | Per-connector credentials, worker isolation, circuit breaker, kill switch, reconciliation |

## Evidence format

Each gate record must include:

- repository commit and environment;
- exact commands or automated workflow;
- test output and exit status;
- relevant artifact digests;
- screenshots or logs only when they do not contain sensitive data;
- reviewer and date;
- unresolved limitations;
- links to defects/exceptions.

## Release rule

A failed R3/R4 gate cannot be waived by the same person who implemented the change. Any exception must follow `02_SECURITY_GOVERNANCE_AND_RISK_OWNERSHIP.md` and have a finite expiration.
