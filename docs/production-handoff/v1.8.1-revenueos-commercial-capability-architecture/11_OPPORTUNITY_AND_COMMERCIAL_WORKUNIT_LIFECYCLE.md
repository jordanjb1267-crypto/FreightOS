# 11 — Opportunity and Commercial WorkUnit Lifecycle

## Opportunity stages

```text
IDENTIFIED
 → QUALIFIED
 → DISCOVERY
 → SOLUTION_FIT
 → COMMERCIAL_REVIEW
 → SECURITY_LEGAL_PROCUREMENT
 → COMMIT
 → WON / LOST / HOLD
 → IMPLEMENTATION_HANDOFF
```

Stage names may map to an existing CRM; the durable semantic state must remain explicit.

## Required evidence by stage

### Qualified
- verified organization/contact;
- target participant type;
- plausible pain/use case;
- fit/exclusion checks.

### Discovery
- current workflow;
- actors/systems;
- measurable pain;
- required integrations;
- decision process;
- constraints.

### Solution fit
- proposed Twin(s);
- capabilities;
- rollout mode;
- dependencies;
- known gaps;
- unsupported requests separated.

### Commercial review
- approved pricing inputs;
- discount gates;
- term;
- meter/quantity;
- commission-affecting facts.

### Security/legal/procurement
- approved responses;
- deviations tracked;
- no self-attested unsupported compliance claims.

### Won
- executed agreement/order evidence;
- exact offer versions;
- entitlement intent;
- implementation handoff package.

## Commercial WorkUnits

Every consequential task can be represented as a WorkUnit with one accountable owner, deadline, inputs, outputs, escalation, evidence, and idempotent side-effect semantics where applicable.
