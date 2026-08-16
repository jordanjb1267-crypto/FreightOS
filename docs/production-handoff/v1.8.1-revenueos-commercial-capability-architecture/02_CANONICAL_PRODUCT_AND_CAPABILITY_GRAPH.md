# 02 — Canonical Product and Capability Graph

## Why this graph exists

RevenueOS requires a machine-readable representation of what FreightOS can sell. Without it, sales scripts become a shadow product catalog and eventually diverge from engineering reality.

## Canonical nodes

### Platform
`FreightOS`

### Participant product / Operational Twin
A sellable participant operating surface built on a `ParticipantOperationalTwin` specialization.

Initial participant families already defined by prior architecture:

- Carrier Operational Twin (COT)
- Facility Operational Twin (FOT)
- Shipper Operational Twin (SOT)
- Broker Operational Twin (BOT)
- Service Provider Operational Twin (SPOT / RigDesk context)

### Capability
A customer-facing business outcome contract.

### Workflow
A durable graph implementing part of a capability.

### Job/component
Certified workforce responsibility: agent, hybrid agent, human-supervised agent, deterministic service, or human role.

### Command/action class
A bounded executable action with authority and policy semantics.

### Integration binding
An approved adapter required by a capability for a specific customer.

### Meter
A value-aligned billing quantity.

## Required graph edges

- `platform HAS_PARTICIPANT_PRODUCT`
- `participant_product OFFERS_CAPABILITY`
- `capability REQUIRES_CAPABILITY`
- `capability IMPLEMENTED_BY_WORKFLOW`
- `workflow OWNED_BY_JOB`
- `job MAY_REQUEST_COMMAND`
- `capability REQUIRES_INTEGRATION_CLASS`
- `capability METERED_BY`
- `capability REQUIRES_CERTIFICATION`
- `capability COMPATIBLE_WITH`
- `capability EXCLUDES`
- `capability CONSUMES_MARKET_SIGNAL_CLASS`
- `market_signal RELEVANT_TO_PARTICIPANT_PRODUCT`
- `market_signal MAY_INFORM_WORKFLOW` (never means MAY_COMMAND)

## Product registry invariants

1. Every quoted SKU resolves to exactly one versioned offer definition.
2. Every offer resolves to explicit capabilities.
3. Every capability resolves to implementation/certification requirements.
4. No offer can imply a command not represented in the command/authority registry.
5. Deprecated versions remain reconstructable for historical contracts.
6. A capability's marketing name may change without changing its immutable internal identity.
7. An internal job/component may change without changing the capability contract unless behavior/authority/SLO materially changes.
8. A material capability change requires compatibility analysis and versioning.
9. A market-intelligence capability resolves to explicit source/signal classes, freshness/confidence rules, customer relevance policy, and consumer boundaries.
10. No graph edge from market intelligence directly creates command authority.

## Capability lifecycle

Recommended abstract lifecycle:

```text
DRAFT
 → REVIEWED
 → PILOT_ELIGIBLE
 → SELLABLE_BOUNDED
 → SELLABLE_GENERAL
 → DEPRECATED
 → RETIRED
```

The audit must map this concept to existing repository vocabularies rather than create duplicate runtime status models.

## Example

```text
Carrier Operations
  └── Dispatch Execution Capability v1
      ├── requires: Carrier Twin
      ├── workflows:
      │   ├── opportunity intake
      │   ├── feasibility/profitability
      │   ├── planning
      │   ├── assignment
      │   └── execution exceptions
      ├── jobs/components: references to certified v1.8 Job Books
      ├── commands: bounded set from command registry
      ├── max autonomy: min(capability ceiling, job certification, customer grant, policy)
      └── meter: managed truck / managed load / agreed enterprise commitment
```

## No agent-as-SKU default

An individual agent may be marketed as a recognizable feature only if the commercial contract still resolves to a governed capability. The implementation identity must not become the durable contract boundary by accident.
