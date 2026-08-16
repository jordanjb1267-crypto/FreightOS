# 17 — Revenue Workflow Graphs

## Graph A — Prospect to qualified opportunity

```text
Account discovered
 → identity/deduplication
 → outreach eligibility/policy
 → contact/outreach
 → response/intent
 → qualification evidence
 → QUALIFIED or RECYCLE/HOLD
```

## Graph B — Discovery to configuration

```text
Qualified opportunity
 → discovery WorkUnits
 → operating workflow map
 → systems/integration inventory
 → pain/value evidence
 → participant/Twin fit
 → capability match
 → gaps separated
 → rollout-mode proposal
 → solution review
```

## Graph C — Quote/proposal

```text
Solution configuration
 → catalog validation
 → pricing inputs
 → deterministic pricing
 → discount authority
 → Promise Firewall
 → security/legal checks as required
 → proposal version
 → customer review
 → revise via new version or accept
```

## Graph D — Closed won to implementation

```text
Executed agreement/order
 → verify offer version
 → create entitlement intent
 → create implementation handoff
 → implementation validates prerequisites
 → Twin/customer configuration review
 → integrations/conformance
 → shadow/certification gates
 → activation decision outside sales plane
```

## Graph E — Expansion

```text
Operational evidence
 → value/usage signal
 → capability-fit hypothesis
 → customer-success review
 → expansion discovery
 → normal quote/proposal controls
 → entitlement change
 → normal activation controls
```

## Graph F — Commission

```text
Eligible financial event
 → resolve plan/version
 → resolve attribution snapshot
 → calculate
 → validate holds/clawback rules
 → finance approval
 → payout record
 → reconciliation
```

## Crash/idempotency rule

Any workflow that produces CRM mutations, proposals, orders, entitlement requests, external messages, or financial events must define idempotency/reconciliation behavior. Duplicate delivery must not duplicate a binding effect.
