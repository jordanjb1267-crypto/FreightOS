# 43 — Graph Authority, State and Handoff Invariants

The following invariants are blocking controls across every candidate graph.

1. **Single owner:** one accountable owner per WorkUnit state.
2. **No authority inheritance:** sender permissions never transfer with an artifact.
3. **Entitlement ≠ activation:** commercial entitlement never creates production operational authority.
4. **Signal ≠ command:** observation, derived indicator, forecast, news event, relevance score, impact statement, recommendation, and alert are non-command artifacts.
5. **Proposal ≠ approval:** an agent-produced proposal cannot approve itself.
6. **Approval is exact:** approval binds to exact subject, action, version, scope, limits, approver, and expiry.
7. **Stale invalidation:** material version changes invalidate bound proposals/approvals before side effect.
8. **Command isolation:** external side effects occur only through registered command/executor boundaries.
9. **Idempotent effect:** duplicate transport/delivery cannot duplicate a business effect.
10. **Reconcile before retry:** uncertain side-effect outcome must be reconciled before retry.
11. **Evidence lineage:** each consequential state is reconstructable from immutable/versioned evidence.
12. **Unknown fails closed:** missing identity, policy, source rights, approval, evidence, or authority yields HOLD/DENY/UNKNOWN.
13. **Kill-switch precedence:** disable/hold controls dominate graph progress.
14. **No hidden Twin mutation:** commercial/FMI learning may propose; it cannot silently rewrite approved customer operations.
15. **No graph self-modification:** agents cannot change graph topology, guards, authority rules, tools, budgets, or certification state.
16. **No cross-tenant learning leak:** customer/network-derived intelligence follows purpose, aggregation, privacy, and disclosure policy.

Any graph that cannot satisfy these invariants must be rejected or decomposed before implementation.
