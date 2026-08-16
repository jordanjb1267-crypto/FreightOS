# 58 — Twin Failure, Conflict, and Reconciliation

## Failure classes

- adapter unavailable;
- authentication/credential failure;
- schema/version mismatch;
- stale external snapshot;
- duplicate event;
- out-of-order event;
- conflicting authoritative claims;
- external write outcome unknown;
- mapping ambiguity;
- customer configuration conflict;
- network acknowledgement timeout;
- counterparty correction/dispute;
- human/agent concurrent edit;
- kill switch/revocation.

## Required behavior

Unknown is represented as `UNKNOWN/STALE/HOLD`, never silently interpreted as current truth.

## Concurrent human/agent edit

Material edits must use version/precondition checks. If a human edits the WorkUnit/proposal after an agent prepared it, any approval bound to the prior version is invalidated.

## External write uncertainty

```text
command submitted
→ timeout/uncertain result
→ mark OUTCOME_UNKNOWN
→ query/reconcile external state
→ confirmed effect? record success
→ confirmed no effect? bounded retry if still authorized/current
→ cannot establish? HOLD/escalate
```

## Integration outage

The Twin should continue safe functions that do not require fresh unavailable data. Anything dependent on stale authoritative data must degrade visibly and fail closed where required.

## Recovery

After restoration:

- re-authenticate;
- determine missed change window;
- ingest/replay safely;
- reconcile versions;
- invalidate stale proposals/approvals;
- resolve conflicts;
- restore freshness status;
- record recovery evidence.
